import {
    Transaction,
    PublicKey,
    SystemProgram,
    SYSVAR_INSTRUCTIONS_PUBKEY,
    ComputeBudgetProgram
} from '@solana/web3.js';
import {
    fetchIdlAccount,
    fetchIdlAccountDataById,
    findMintMetadataId,
    decodeIdlAccount,
    findAta,
    tryNull,
    findTokenRecordId,
    connectionFor
} from "@cardinal/common";
import { utils } from "@coral-xyz/anchor";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import { PROGRAM_ID as TOKEN_AUTH_RULES_ID } from "@metaplex-foundation/mpl-token-auth-rules";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getMint } from "@solana/spl-token";//for staking 
import { AnchorProvider, Program } from "@project-serum/anchor";
import {
    findMintManagerId,
    MintManager,
    PROGRAM_ID as CREATOR_STANDARD_PROGRAM_ID,
} from "@cardinal/creator-standard";
const anchor = require('@project-serum/anchor');
import { Metaplex } from '@metaplex-foundation/js';
import BN from "bn.js";

let hacoIdentifier = `TTGG`;//this is for the owner
let REWARDS_CENTER_ADDRESS = new PublicKey("5n4FXHbJHum7cW9w1bzYY8gdvgyC92Zk7yD2Qi9mW13g")
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

async function hacopayment (payer, connection, wallet) {

    const provider = new AnchorProvider(connection, wallet)
    const paymentInfoId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("payment-info"),
        utils.bytes.utf8.encode(hacoIdentifier),
        //utils.bytes.utf8.encode('1'),
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    const idl = await Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);
    const stakePaymentInfoData = await fetchIdlAccount(
        connection,
        paymentInfoId,
        "PaymentInfo",
        idl
    );

    const remainingAccounts = [
        {
            pubkey: stakePaymentInfoData.pubkey,
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: payer,
            isSigner: true,
            isWritable: true,
        },
        {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
        },
        {// target
            pubkey: stakePaymentInfoData.parsed.paymentShares[0].address,
            isSigner: false,
            isWritable: true,
        }
    ];

    return remainingAccounts;
}

export const claimRewards = async (connection, wallet, stakePoolIdentifier, mintIds, rewardDistributorIds, claimingRewardsForUsers) => {

    const provider = new AnchorProvider(connection, wallet)
    const idl = await Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);
    const program = new Program(idl, REWARDS_CENTER_ADDRESS, provider);
    const isFungible = false;
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
            utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
            utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        REWARDS_CENTER_ADDRESS // REWARDS_CENTER_ADDRESS
    )[0];
    const txs = [];

    //建立mints變量包含mintId、stakeEntryId、rewardEntryIds後續使用
    const mints = mintIds.map(
        ({ mintId }) => {
            const stakeEntryId = PublicKey.findProgramAddressSync(
                [
                    utils.bytes.utf8.encode("stake-entry"),
                    stakePoolId.toBuffer(),
                    mintId.toBuffer(),
                    wallet.publicKey && isFungible ? wallet.publicKey.toBuffer() : PublicKey.default.toBuffer(),
                ],
                REWARDS_CENTER_ADDRESS
            )[0];
            return {
                mintId,
                stakeEntryId,
                rewardEntryIds: rewardDistributorIds?.map((rewardDistributorId) =>
                    PublicKey.findProgramAddressSync(
                        [
                            utils.bytes.utf8.encode("reward-entry"),
                            rewardDistributorId.toBuffer(),
                            stakeEntryId.toBuffer(),
                        ],
                        REWARDS_CENTER_ADDRESS
                    )[0]
                ),
            };
        });

    //這個函數可從id ( PublicKey.findProgramAddressSync的返回都表示為id ) 得出該資料，這裡一次獲取多個
    let accountDataById = await fetchIdlAccountDataById(
        connection,
        [...(rewardDistributorIds ?? []),
        ...mints.map((m) => m.rewardEntryIds ?? []).flat(),
        ...(claimingRewardsForUsers
            ? mints.map((m) => PublicKey.findProgramAddressSync(
                [
                    utils.bytes.utf8.encode("stake-entry"),
                    stakePoolId.toBuffer(),
                    m.mintId.toBuffer(),
                    PublicKey.default.toBuffer()
                ],
                REWARDS_CENTER_ADDRESS
            )[0]).flat()
            : []),
        ],
        REWARDS_CENTER_ADDRESS,
        idl
    );

    //從上述accountDataById獲取payment資料
    const claimRewardsPaymentInfoIds = rewardDistributorIds?.map((id) => {
        const rewardDistributorData = accountDataById[id.toString()];
        if (
            rewardDistributorData &&
            rewardDistributorData.type === "rewardDistributor"
        ) {
            return rewardDistributorData.parsed.claimRewardsPaymentInfo;
        }
        return null;
    });

    //第二段獲取id資料，在下一段程式碼對第一段accountDataById進行合併
    const accountDataById2 = await fetchIdlAccountDataById(connection, [
        ...(claimRewardsPaymentInfoIds ?? []),
    ]);
    accountDataById = { ...accountDataById, ...accountDataById2 };

    //對第一段建立的mints進行transaction實作
    for (const { stakeEntryId, rewardEntryIds } of mints) {
        const tx = new Transaction();
        if (
            rewardEntryIds &&
            rewardDistributorIds &&
            rewardDistributorIds?.length > 0
        ) {
            //1. 更新總staking時長
            const ix = await program
                .methods.updateTotalStakeSeconds()
                .accounts({
                    stakeEntry: stakeEntryId,
                    updater: wallet.publicKey,
                })
                .instruction();
            tx.add(ix);

            // 這裡判斷獎勵分配，必須先進行初始化然後在這才能順利執行，這段在unstake有一樣的寫法
            for (let j = 0; j < rewardDistributorIds.length; j++) {
                const rewardDistributorId = rewardDistributorIds[j];
                const rewardDistributorData =
                    accountDataById[rewardDistributorId.toString()];
                const rewardEntryId = rewardEntryIds[j];
                if (
                    rewardEntryId &&
                    rewardDistributorData &&
                    rewardDistributorData.type === "RewardDistributor"
                ) {
                    const rewardMint = rewardDistributorData.parsed.rewardMint;
                    const rewardEntry = accountDataById[rewardEntryId?.toString()];
                    const rewardDistributorTokenAccount = getAssociatedTokenAddressSync(
                        rewardMint,
                        rewardDistributorId,
                        true,
                    );
                    const stakeEntryDataInfo = accountDataById[stakeEntryId.toString()];
                    console.log('stakeinfo:',stakeEntryDataInfo)
                    // const userRewardMintTokenAccountOwnerId = stakeEntryDataInfo
                    //     ? decodeIdlAccount(stakeEntryDataInfo, "StakeEntry").parsed
                    //         .lastStaker
                    //     : wallet.publicKey;
                    console.log(stakeEntryDataInfo)
                    const userRewardMintTokenAccountOwnerId = stakeEntryDataInfo
                        ? stakeEntryDataInfo.parsed
                            .lastStaker
                        : wallet.publicKey;
                    
                    const userRewardMintTokenAccount = await findAta(
                        rewardMint,
                        userRewardMintTokenAccountOwnerId,
                        true
                    );
                    tx.add(
                        createAssociatedTokenAccountIdempotentInstruction(
                            wallet.publicKey,
                            userRewardMintTokenAccount,
                            userRewardMintTokenAccountOwnerId,
                            rewardMint
                        )
                    );

                    //2. 第一次獲取獎勵沒有reward，需要初始化
                    if (!rewardEntry) {
                        const ix = await program
                            .methods.initRewardEntry()
                            .accounts({
                                rewardEntry: PublicKey.findProgramAddressSync(
                                    [
                                        utils.bytes.utf8.encode("reward-entry"),
                                        rewardDistributorId.toBuffer(),
                                        stakeEntryId.toBuffer(),
                                    ],
                                    REWARDS_CENTER_ADDRESS
                                )[0],
                                rewardDistributor: rewardDistributorId,
                                stakeEntry: stakeEntryId,
                                payer: wallet.publicKey,
                            })
                            .instruction();
                        tx.add(ix);
                    }

                    //remainingAccounts會需要使用到payment，這裡近行全部操作
                    // const remainingAccountsForPayment = [];
                    // const paymentInfoId = PublicKey.findProgramAddressSync(
                    //     [
                    //         utils.bytes.utf8.encode("payment-info"),
                    //         utils.bytes.utf8.encode(stakePoolIdentifier),
                    //     ],
                    //     REWARDS_CENTER_ADDRESS
                    // )[0];
                    // const paymntinfo = await fetchIdlAccountDataById(
                    //     connection,
                    //     [paymentInfoId],
                    //     REWARDS_CENTER_ADDRESS,
                    //     idl
                    // )

                    // if (paymntinfo[Object.keys(paymntinfo)[0]] && paymntinfo[Object.keys(paymntinfo)[0]].type === "PaymentInfo") {

                    //     remainingAccountsForPayment.push(
                    //         ...withRemainingAccountsForPaymentInfoSync(
                    //             tx,
                    //             wallet.publicKey,
                    //             paymntinfo[Object.keys(paymntinfo)[0]]
                    //         )
                    //     );
                        
                    // }
                    const remainingAccounts = await hacopayment(wallet.publicKey, connection, wallet)

                    //3. 獲取獎勵
                    const ix = await program
                        .methods.claimRewards()
                        .accounts({
                            rewardEntry: PublicKey.findProgramAddressSync(
                                [
                                    utils.bytes.utf8.encode("reward-entry"),
                                    rewardDistributorId.toBuffer(),
                                    stakeEntryId.toBuffer(),
                                ],
                                REWARDS_CENTER_ADDRESS
                            )[0],
                            rewardDistributor: rewardDistributorId,
                            stakeEntry: stakeEntryId,
                            stakePool: stakePoolId,
                            rewardMint: rewardMint,
                            userRewardMintTokenAccount: userRewardMintTokenAccount,
                            rewardDistributorTokenAccount: rewardDistributorTokenAccount,
                            user: wallet.publicKey,
                            tokenProgram: TOKEN_PROGRAM_ID,
                            systemProgram: SystemProgram.programId
                        })
                        .remainingAccounts(remainingAccounts)
                        .instruction();
                    tx.add(ix);
                }
            }
        }
        txs.push(tx);
    }

    return txs;
}

export const unstake = async (connection, wallet, stakePoolIdentifier, mintIds, rewardDistributorIds, userattribute, proofId) => {

    const provider = new AnchorProvider(connection, wallet)
    const idl = await Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);
    const program = new Program(idl, REWARDS_CENTER_ADDRESS, provider);

    const stakePoolId = PublicKey.findProgramAddressSync(
        [
            utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
            utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        REWARDS_CENTER_ADDRESS
    )[0];

    const txs = [];

    //同上claimreward函數內容mints的建立方式
    const mints = mintIds.map(({ mintId, fungible }) => {
        const stakeEntryId = PublicKey.findProgramAddressSync(
            [
                utils.bytes.utf8.encode("stake-entry"),
                stakePoolId.toBuffer(),
                mintId.toBuffer(),
                PublicKey.default.toBuffer(),
            ],
            REWARDS_CENTER_ADDRESS
        )[0];
        return {
            mintId,
            stakeEntryId,
            rewardEntryIds: rewardDistributorIds?.map((rewardDistributorId) =>
                PublicKey.findProgramAddressSync(
                    [
                        utils.bytes.utf8.encode("reward-entry"),
                        rewardDistributorId.toBuffer(),
                        stakeEntryId.toBuffer(),
                    ],
                    REWARDS_CENTER_ADDRESS
                )[0]
            ),
        };
    });
    const distributor = await fetchIdlAccountDataById(
        connection,
        [rewardDistributorIds[0]],
        REWARDS_CENTER_ADDRESS,
        idl
    )

    let accountDataById = await fetchIdlAccountDataById(connection, [
        stakePoolId,
        ...mints.map((m) => m.rewardEntryIds ?? []).flat(),
        ...mints.map((m) => m.stakeEntryId),
    ],
        //需要明確指定是哪個program以及idl
        REWARDS_CENTER_ADDRESS,
        idl
    );

    const stakePool = await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        // fetchIdlAccountDataById都需注意下列兩行
        REWARDS_CENTER_ADDRESS,
        idl
    )

    const stakePoolData = stakePool[Object.keys(stakePool)[0]]//針對所有fetchIdlAccountDataById獲取的資料處理
    if (!stakePoolData?.parsed || stakePoolData.type !== "StakePool") {
        throw "Stake pool not found";
    }

    //合併所有accountData，distributor的鍵可改進成自己抓取而非硬編碼
    //accountDataById = { ...accountDataById, ...accountDataById2, ...distributor };
    accountDataById = { ...accountDataById, ...distributor };
    for (const { mintId, stakeEntryId, rewardEntryIds } of mints) {
        const metadataId = findMintMetadataId(mintId); //v2

        const tx = new Transaction();
        const userEscrowId = PublicKey.findProgramAddressSync(
            [
                utils.bytes.utf8.encode("escrow"),
                wallet.publicKey.toBuffer()
            ],
            REWARDS_CENTER_ADDRESS
        )[0];
        const userAtaId = getAssociatedTokenAddressSync(mintId, wallet.publicKey);
        const stakeEntry = accountDataById[stakeEntryId.toString()];
        if (
            rewardEntryIds &&
            rewardDistributorIds &&
            rewardDistributorIds.length > 0 &&
            !(
                stakeEntry?.type === "StakeEntry" &&
                stakeEntry.parsed.cooldownStartSeconds
            )
        ) {

            //新增stake總時長
            const ix = await program
                .methods.updateTotalStakeSeconds()
                .accounts({
                    stakeEntry: stakeEntryId,
                    updater: wallet.publicKey,
                })
                .instruction();
            tx.add(ix);

            //由於輸入的reward可包含多個公鑰，這裡會各別處理，但是正常來說只會有一個因為不會跨池(rewardDistributorIds的變量是由stakePoolId及program判斷的)
            for (let j = 0; j < rewardDistributorIds.length; j++) {

                const rewardDistributorId = rewardDistributorIds[j];
                const rewardDistributorData = accountDataById[rewardDistributorId.toString()];
                const rewardEntryId = rewardEntryIds[j];
                if (
                    rewardEntryId &&
                    rewardDistributorData &&
                    rewardDistributorData.type === "RewardDistributor"
                ) {
                    const rewardMint = rewardDistributorData.parsed.rewardMint;
                    const rewardEntry = accountDataById[rewardEntryId?.toString()];
                    //在transfer時所需的mint & owner ATA 以及 mint & receiver ATA 
                    const rewardDistributorTokenAccount = getAssociatedTokenAddressSync(
                        rewardMint,
                        rewardDistributorId,
                        true
                    );
                    const userRewardMintTokenAccount = getAssociatedTokenAddressSync(
                        rewardMint,
                        wallet.publicKey,
                        true
                    );
                    console.log(rewardDistributorData)
                    //unstake同時包含claim reward所以還是需要判斷entry是否已經初始化
                    if (!rewardEntry) {

                        const ix = await program
                            .methods.initRewardEntry()
                            .accounts({
                                rewardEntry: PublicKey.findProgramAddressSync(
                                    [
                                        utils.bytes.utf8.encode("reward-entry"),
                                        rewardDistributorId.toBuffer(),
                                        stakeEntryId.toBuffer(),
                                    ],
                                    REWARDS_CENTER_ADDRESS
                                )[0],
                                rewardDistributor: rewardDistributorId,
                                stakeEntry: stakeEntryId,
                                payer: wallet.publicKey,
                            })
                            .instruction();
                        tx.add(ix);

                    }
                    const collectionMulId = PublicKey.findProgramAddressSync(
                        [
                            utils.bytes.utf8.encode('collection-mul'),
                            utils.bytes.utf8.encode(stakePoolIdentifier),
                        ],
                        REWARDS_CENTER_ADDRESS
                    )[0];
                    const attributeMulId = PublicKey.findProgramAddressSync(
                        [
                            utils.bytes.utf8.encode('attribute-mul'),
                            utils.bytes.utf8.encode(stakePoolIdentifier),
                        ],
                        REWARDS_CENTER_ADDRESS
                    )[0];
                    const remainingAccounts = await hacopayment(wallet.publicKey, connection, wallet)
                    const new_remaining_1 = {
                        pubkey: metadataId,
                        isSigner: false,
                        isWritable: true
                    }
                    const new_remaining_2 = {
                        pubkey: collectionMulId,
                        isSigner: false,
                        isWritable: false                       
                    }
                    const new_remaining_3 = {
                        pubkey: attributeMulId,
                        isSigner: false,
                        isWritable: false                       
                    }
                    const new_remaining_4 = {
                        pubkey: userattribute,
                        isSigner: false,
                        isWritable: false                       
                    }
                    const new_remaining_5 = {
                        pubkey: proofId,
                        isSigner: false,
                        isWritable: false                       
                    }
                    remainingAccounts.unshift(new_remaining_1, new_remaining_2, new_remaining_3, new_remaining_4, new_remaining_5)
                    console.log(remainingAccounts[0].pubkey == new_remaining_1.pubkey)
                    const ix = await program
                        .methods.claimRewards()
                        .accounts({
                            rewardEntry: PublicKey.findProgramAddressSync(
                                [
                                    utils.bytes.utf8.encode("reward-entry"),
                                    rewardDistributorId.toBuffer(),
                                    stakeEntryId.toBuffer(),
                                ],
                                REWARDS_CENTER_ADDRESS
                            )[0],
                            rewardDistributor: rewardDistributorId,
                            stakeEntry: stakeEntryId,
                            stakePool: stakePoolId,
                            rewardMint: rewardMint,
                            // stakeMintMetadata: metadataId,
                            // collectionMul: collectionMulId,
                            userRewardMintTokenAccount: userRewardMintTokenAccount,
                            rewardDistributorTokenAccount: rewardDistributorTokenAccount,
                            // attributeMul: attr,
                            ownerInfo: new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"),
                            user: wallet.publicKey,
                            tokenProgram: TOKEN_PROGRAM_ID,
                            systemProgram: SystemProgram.programId
                        })
                        .remainingAccounts(remainingAccounts)//remainingAccounts目前為止都是為了放入payment而新增的
                        .instruction();
                    tx.add(ix);
                }
            }
        }

        const remainingAccounts = await hacopayment(wallet.publicKey, connection, wallet)
        
        // const metadataId = findMintMetadataId(mintId);
        const metadata = await tryNull(
            Metadata.fromAccountAddress(connection, metadataId)
        );
        //unstake從這裡開始寫
        const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
        const editionId = PublicKey.findProgramAddressSync(
            [
                utils.bytes.utf8.encode("metadata"),
                METADATA_PROGRAM_ID.toBuffer(),
                mintId.toBuffer(),
                utils.bytes.utf8.encode("edition"),
            ],
            METADATA_PROGRAM_ID
        )[0];
        const stakeTokenRecordAccountId = findTokenRecordId(mintId, userAtaId);
        tx.add(
            ComputeBudgetProgram.setComputeUnitLimit({
                units: 100000000,
            })
        );
        const unstakeIx = await program
            .methods.unstakePnft()
            .accountsStrict({
                stakePool: stakePoolId,
                stakeEntry: stakeEntryId,
                stakeMint: mintId,
                stakeMintMetadata: metadataId,
                stakeMintEdition: editionId,
                stakeTokenRecordAccount: stakeTokenRecordAccountId,
                authorizationRules:
                    metadata?.programmableConfig?.ruleSet ?? METADATA_PROGRAM_ID,
                user: wallet.publicKey,
                userEscrow: userEscrowId,
                userStakeMintTokenAccount: userAtaId,
                tokenMetadataProgram: METADATA_PROGRAM_ID,
                sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                authorizationRulesProgram: TOKEN_AUTH_RULES_ID,
            })
            .remainingAccounts(remainingAccounts)
            .instruction();
        tx.add(unstakeIx);

        txs.push(tx);
    }

    return txs;
}

export const stake = async (connection, wallet, stakePoolIdentifier, mintIds) => {

    const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const provider = new AnchorProvider(connection, wallet)
    const idl = await Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);
    const program = new Program(idl, REWARDS_CENTER_ADDRESS, provider);
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
            utils.bytes.utf8.encode('stake-pool'),
            utils.bytes.utf8.encode(stakePoolIdentifier),
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    const txs = [];

    //建立mints包含所需資料的公鑰
    const mints = mintIds.map(
        ({ mintId }) => {
            return {
                mintId,
                stakeEntryId: PublicKey.findProgramAddressSync(
                    [
                        utils.bytes.utf8.encode("stake-entry"),
                        stakePoolId.toBuffer(),
                        mintId.toBuffer(),
                        PublicKey.default.toBuffer(),
                    ],
                    REWARDS_CENTER_ADDRESS
                )[0],
                mintTokenAccountId: getAssociatedTokenAddressSync(mintId, wallet.publicKey, true),
            };
        }
    );

    //建立accountDataById，包含上述建立mints裡id的所有資料
    const accountDataById = await fetchIdlAccountDataById(connection, [
        stakePoolId,
        ...mints.map((m) => m.stakeEntryId),
        ...mints.map((m) => findMintMetadataId(m.mintId)),
    ],
        //範例沒有這兩行但這裡需要明確表示
        REWARDS_CENTER_ADDRESS,
        idl
    );

    //判斷accountDataById裡獲取資料的內容，先是確認有池的存在
    const stakePoolData = accountDataById[stakePoolId.toString()];
    if (!stakePoolData?.parsed || stakePoolData.type !== "StakePool") {
        throw "Stake pool not found";
    }

    //開始對上面mints裡的所有資料進行判斷，皆為獲取stake pnft所需要的公鑰
    for (const { mintId, mintTokenAccountId, stakeEntryId } of mints) {

        const tx = new Transaction();
        const metadataId = findMintMetadataId(mintId);
        const metadataAccountInfo = accountDataById[metadataId.toString()];
        const metadataInfo = metadataAccountInfo
            ? Metadata.fromAccountInfo(metadataAccountInfo)[0]
            : undefined;

        //第一次stake需要init entry
        console.log(program.methods.initEntry())
        if (!accountDataById[stakeEntryId.toString()]) {

            const ix = await program
                .methods.initEntry({
                    user: wallet.publicKey
                })
                .accounts({
                    stakeEntry: stakeEntryId,
                    stakePool: stakePoolId,
                    stakeMint: mintId,
                    stakeMintMetadata: metadataId,
                    payer: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();
            tx.add(ix);
        }
        const userEscrowId = PublicKey.findProgramAddressSync(
            [utils.bytes.utf8.encode("escrow"), wallet.publicKey.toBuffer()],
            REWARDS_CENTER_ADDRESS
        )[0];

        const remainingAccounts = await hacopayment(wallet.publicKey, connection, wallet)

        const editionId = PublicKey.findProgramAddressSync(
            [
                utils.bytes.utf8.encode("metadata"),
                METADATA_PROGRAM_ID.toBuffer(),
                mintId.toBuffer(),
                utils.bytes.utf8.encode("edition"),
            ],
            METADATA_PROGRAM_ID
        )[0];
        const stakeTokenRecordAccountId = findTokenRecordId(
            mintId,
            mintTokenAccountId
        );
        tx.add(
            ComputeBudgetProgram.setComputeUnitLimit({
                units: 100000000,
            })
        );
        const stakeIx = await program
            .methods.stakePnft()
            .accountsStrict({
                stakePool: stakePoolId,
                stakeEntry: stakeEntryId,
                stakeMint: mintId,
                stakeMintMetadata: metadataId,
                stakeMintEdition: editionId,
                stakeTokenRecordAccount: stakeTokenRecordAccountId,
                authorizationRules:
                    metadataInfo?.programmableConfig?.ruleSet ?? METADATA_PROGRAM_ID,
                user: wallet.publicKey,
                userEscrow: userEscrowId,
                userStakeMintTokenAccount: mintTokenAccountId,
                tokenMetadataProgram: METADATA_PROGRAM_ID,
                sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                authorizationRulesProgram: TOKEN_AUTH_RULES_ID,
            })
            .remainingAccounts(remainingAccounts)
            .instruction();
        tx.add(stakeIx);
        txs.push(tx);
    }

    return txs;
}

export const stake_spl = async (connection, wallet, stakePoolIdentifier, mintIds) => {
    const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const provider = new AnchorProvider(connection, wallet)
    const idl = await Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);
    const program = new Program(idl, REWARDS_CENTER_ADDRESS, provider);
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
            utils.bytes.utf8.encode('stake-pool'),
            utils.bytes.utf8.encode(stakePoolIdentifier),
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    const txs = [];

    //建立mints包含所需資料的公鑰
    const mints = mintIds.map(
        ({ mintId }) => {
            return {
                mintId,
                stakeEntryId: PublicKey.findProgramAddressSync(
                    [
                        utils.bytes.utf8.encode("stake-entry"),
                        stakePoolId.toBuffer(),
                        mintId.toBuffer(),
                        PublicKey.default.toBuffer(),
                    ],
                    REWARDS_CENTER_ADDRESS
                )[0],
                mintTokenAccountId: getAssociatedTokenAddressSync(mintId, wallet.publicKey, true),
            };
        }
    );

    //建立accountDataById，包含上述建立mints裡id的所有資料
    const accountDataById = await fetchIdlAccountDataById(connection, [
        stakePoolId,
        ...mints.map((m) => m.stakeEntryId),
        ...mints.map((m) => findMintManagerId(m.mintId)),
        ...mints.map((m) => findMintMetadataId(m.mintId)),
        ],
        //範例沒有這兩行但這裡需要明確表示
        REWARDS_CENTER_ADDRESS,
        idl
    );

    //判斷accountDataById裡獲取資料的內容，先是確認有池的存在
    const stakePoolData = accountDataById[stakePoolId.toString()];
    if (!stakePoolData?.parsed || stakePoolData.type !== "StakePool") {
        throw "Stake pool not found";
    }

    //開始對上面mints裡的所有資料進行判斷，皆為獲取stake pnft所需要的公鑰
    for (const { mintId, mintTokenAccountId, stakeEntryId, amount } of mints) {

        const tx = new Transaction();
        const metadataId = findMintMetadataId(mintId);
        const mintManagerId = findMintManagerId(mintId);
        const mintManagerAccountInfo = accountDataById[mintManagerId.toString()];
        const metadataAccountInfo = accountDataById[metadataId.toString()];
        const metadataInfo = metadataAccountInfo
            ? Metadata.fromAccountInfo(metadataAccountInfo)[0]
            : undefined;
        const userEscrowId = PublicKey.findProgramAddressSync(
            [
                utils.bytes.utf8.encode("escrow"), 
                wallet.publicKey.toBuffer()
            ],
            REWARDS_CENTER_ADDRESS
          )[0];
        const remainingAccounts = await hacopayment(wallet.publicKey, connection, wallet)

        // const mintManager = MintManager.fromAccountInfo(
        //     mintManagerAccountInfo
        // )[0];
        // const stakeIx = await program
        //     .methods.stakeCcs(new BN(amount ?? 1))
        //     .accounts({
        //     stakePool: stakePoolId,
        //     stakeEntry: stakeEntryId,
        //     stakeMint: mintId,
        //     stakeMintMetadata: metadataId,
        //     stakeMintManager: mintManagerId,
        //     stakeMintManagerRuleset: mintManager.ruleset,
        //     user: wallet.publicKey,
        //     userEscrow: userEscrowId,
        //     userStakeMintTokenAccount: mintTokenAccountId,
        //     creatorStandardProgram: CREATOR_STANDARD_PROGRAM_ID,
        //     tokenProgram: TOKEN_PROGRAM_ID,
        //     systemProgram: SystemProgram.programId,
        //     })
        //     .remainingAccounts(remainingAccounts)
        //     .instruction();
        // tx.add(stakeIx);
        // txs.push(tx)
        const ads = await fetchIdlAccountDataById(
            connection, 
            [mintManagerId],
            REWARDS_CENTER_ADDRESS,
            idl
        );
        txs.push(ads)
    }

    return txs;
}