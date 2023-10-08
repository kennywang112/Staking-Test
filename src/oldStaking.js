import { findMintManagerId } from "@cardinal/creator-standard";
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
    findTokenRecordId
} from "@cardinal/common";
import { utils } from "@coral-xyz/anchor";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import { PROGRAM_ID as TOKEN_AUTH_RULES_ID } from "@metaplex-foundation/mpl-token-auth-rules";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";//for staking 
import { AnchorProvider, Program } from "@project-serum/anchor";
import BN from "bn.js";

const VUE_STAKING_PROGRAM_ID = new PublicKey("An63Hmi2dsQxybVhxRvoXHKRM1qeruYF3J9cEmrBSjsM");
const paymentidentifier = "2";
//函數會要求提供payment info的資料，payment及目的
function withRemainingAccountsForPaymentInfoSync(transaction, payer, paymentInfoData) {

    const remainingAccounts = [
        {
            pubkey: paymentInfoData.pubkey,
            isSigner: false,
            isWritable: false,
        },
    ];

    // add payer
    if (Number(paymentInfoData.parsed.paymentAmount) === 0)
        return remainingAccounts;

    remainingAccounts.push(
        ...withRemainingAccountsForPayment(
            transaction,
            payer,
            paymentInfoData.parsed.paymentMint,
            paymentInfoData.parsed.paymentShares.map(p => p.address)
        )
    );

    return remainingAccounts;

}
//帶入上述函數
function withRemainingAccountsForPayment(transaction, payer, paymentMint, paymentTargets) {

    const remainingAccounts = [
        {
            pubkey: payer,
            isSigner: true,
            isWritable: true,
        },
    ];

    if (paymentMint.equals(PublicKey.default)) {
        remainingAccounts.push({
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
        });
        remainingAccounts.push(
            ...paymentTargets.map(a => ({
                pubkey: a,
                isSigner: false,
                isWritable: true,
            }))
        );
    } else {
        remainingAccounts.push({
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
        });
        remainingAccounts.push({
            pubkey: getAssociatedTokenAddressSync(paymentMint, payer, true),
            isSigner: false,
            isWritable: true,
        });
        const ataIds = paymentTargets.map(a =>
            getAssociatedTokenAddressSync(paymentMint, a, true)
        );
        for (let i = 0; i < ataIds.length; i++) {
            transaction.add(
                createAssociatedTokenAccountIdempotentInstruction(
                    payer,
                    ataIds[i],
                    paymentTargets[i],
                    paymentMint
                )
            );
        }
        remainingAccounts.push(
            ...ataIds.map(id => ({
                pubkey: id,
                isSigner: false,
                isWritable: true,
            }))
        );
    }
    return remainingAccounts;
}
async function hacopayment (payer, connection, wallet) {

    const provider = new AnchorProvider(connection, wallet)
    const paymentInfoId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("payment-info"),
        utils.bytes.utf8.encode(paymentidentifier),
        ],
        VUE_STAKING_PROGRAM_ID
    )[0];
    const idl = await Program.fetchIdl(VUE_STAKING_PROGRAM_ID, provider);
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

export const claimRewardsOld = async (connection, wallet, stakePoolIdentifier, mintIds, rewardDistributorIds, claimingRewardsForUsers) => {

    const provider = new AnchorProvider(connection, wallet)
    const stakingprogram = new PublicKey(VUE_STAKING_PROGRAM_ID);
    const idl = await Program.fetchIdl(stakingprogram, provider);
    const program = new Program(idl, stakingprogram, provider);
    const isFungible = false;
    const REWARDS_CENTER_ADDRESS = new PublicKey(VUE_STAKING_PROGRAM_ID);
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
            utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
            utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        REWARDS_CENTER_ADDRESS // REWARDS_CENTER_ADDRESS
    )[0];
    const txs = [];

    //多個mint同時進行stake
    for (const mintId of mintIds) {

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
                        const userRewardMintTokenAccountOwnerId = stakeEntryDataInfo
                            ? decodeIdlAccount(stakeEntryDataInfo, "stakeEntry").parsed
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
                        const remainingAccountsForPayment = [];
                        const paymentInfoId = PublicKey.findProgramAddressSync(
                            [
                                utils.bytes.utf8.encode("payment-info"),
                                utils.bytes.utf8.encode(paymentidentifier),
                            ],
                            new PublicKey(VUE_STAKING_PROGRAM_ID)
                        )[0];
                        const paymntinfo = await fetchIdlAccountDataById(
                            connection,
                            [paymentInfoId],
                            REWARDS_CENTER_ADDRESS,
                            idl
                        )

                        if (paymntinfo[Object.keys(paymntinfo)[0]] && paymntinfo[Object.keys(paymntinfo)[0]].type === "PaymentInfo") {

                            remainingAccountsForPayment.push(
                                ...withRemainingAccountsForPaymentInfoSync(
                                    tx,
                                    wallet.publicKey,
                                    paymntinfo[Object.keys(paymntinfo)[0]]
                                )
                            );

                        }

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
                            .remainingAccounts(remainingAccountsForPayment)//否則會出現account key不夠
                            .instruction();
                        tx.add(ix);
                    }
                }
            }
            txs.push(tx);
        }
    }
    return txs;
}

export const unstakeOld = async (connection, wallet, stakePoolIdentifier, mintIds, rewardDistributorIds) => {

    const provider = new AnchorProvider(connection, wallet)
    const stakingprogram = new PublicKey(VUE_STAKING_PROGRAM_ID);
    const idl = await Program.fetchIdl(stakingprogram, provider);
    const program = new Program(idl, stakingprogram, provider);
    const REWARDS_CENTER_ADDRESS = new PublicKey(VUE_STAKING_PROGRAM_ID)
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
            utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
            utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        new PublicKey(VUE_STAKING_PROGRAM_ID) // REWARDS_CENTER_ADDRESS
    )[0];

    const txs = [];
    for (const mintId of mintIds) {

        //同上claimreward函數內容mints的建立方式
        const mints = mintIds.map(({ mintId, fungible }) => {
            const stakeEntryId = PublicKey.findProgramAddressSync(
                [
                    utils.bytes.utf8.encode("stake-entry"),
                    stakePoolId.toBuffer(),
                    mintId.toBuffer(),
                    PublicKey.default.toBuffer(),
                ],
                new PublicKey(VUE_STAKING_PROGRAM_ID)
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
            new PublicKey(VUE_STAKING_PROGRAM_ID),
            idl
        )

        let accountDataById = await fetchIdlAccountDataById(connection, [
            stakePoolId,
            ...mints.map((m) => m.rewardEntryIds ?? []).flat(),
            ...mints.map((m) => findMintManagerId(m.mintId)),
            ...mints.map((m) => m.stakeEntryId),
        ],
            //需要明確指定是哪個program以及idl
            new PublicKey(VUE_STAKING_PROGRAM_ID),
            idl
        );

        const stakePool = await fetchIdlAccountDataById(
            connection,
            [stakePoolId],
            // fetchIdlAccountDataById都需注意下列兩行
            new PublicKey(VUE_STAKING_PROGRAM_ID),
            idl
        )

        const stakePoolData = stakePool[Object.keys(stakePool)[0]]//針對所有fetchIdlAccountDataById獲取的資料處理
        if (!stakePoolData?.parsed || stakePoolData.type !== "StakePool") {
            throw "Stake pool not found";
        }

        const reward = await fetchIdlAccountDataById(
            connection,
            [rewardDistributorIds[0]],
            new PublicKey(VUE_STAKING_PROGRAM_ID),
            idl
        )

        //獲取獎勵的payment
        const claimRewardsPaymentInfoIds = rewardDistributorIds?.map((id) => {
            const rewardDistributorData = reward[rewardDistributorIds[0]];
            if (
                rewardDistributorData &&
                rewardDistributorData.type === "RewardDistributor"
            ) {
                return rewardDistributorData.parsed.claimRewardsPaymentInfo;
            }
            return null;
        });
        const accountDataById2 = await fetchIdlAccountDataById(connection, [
            stakePoolData.parsed.unstakePaymentInfo,
            ...(claimRewardsPaymentInfoIds ?? [])
        ],
            new PublicKey(VUE_STAKING_PROGRAM_ID),
            idl
        );
        const distributorKey = Object.keys(distributor)[0];
        accountDataById = { ...accountDataById, ...accountDataById2, ...distributor };
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
                        // const remainingAccountsForPayment = [];
                        // const claimRewardsPaymentInfo = accountDataById[rewardDistributorData.parsed.claimRewardsPaymentInfo.toString()];
                        // if (
                        //     claimRewardsPaymentInfo &&
                        //     claimRewardsPaymentInfo.type === "PaymentInfo"
                        // ) {
                        //     //帶入上述函數，針對payment的remaining account
                        //     remainingAccountsForPayment.push(
                        //         ...withRemainingAccountsForPaymentInfoSync(
                        //             tx,
                        //             wallet.publicKey,
                        //             claimRewardsPaymentInfo
                        //         )
                        //     );
                        // }
                        const remainingAccountsForPayment = await hacopayment(wallet.publicKey, connection, wallet)
                        // console.log(remainingAccountsForPayment)
                        const new_remaining_1 = {
                            pubkey: metadataId,
                            isSigner: false,
                            isWritable: true
                        }
                        console.log("meta ",metadataId)
                        // for changing program folder
                        remainingAccountsForPayment.unshift(new_remaining_1, new_remaining_1, new_remaining_1, new_remaining_1)
                        
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
                            .remainingAccounts(remainingAccountsForPayment)//remainingAccounts目前為止都是為了放入payment而新增的
                            .instruction();
                        tx.add(ix);
                    }
                }
            }

            const remainingAccounts = [];
            const unstakePaymentInfo = accountDataById[stakePoolData.parsed.unstakePaymentInfo.toString()];
            if (unstakePaymentInfo && unstakePaymentInfo.type === "PaymentInfo") {

                remainingAccounts.push(
                    ...withRemainingAccountsForPaymentInfoSync(
                        tx,
                        wallet.publicKey,
                        unstakePaymentInfo
                    )
                );

            }
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
            if (metadata?.programmableConfig) {

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
            } else {

                const unstakeIx = await program
                .methods.unstakeEdition()
                .accounts({
                  stakeEntry: stakeEntryId,
                  stakePool: stakePoolId,
                  stakeMint: mintId,
                  stakeMintEdition: editionId,
                  user: wallet.publicKey,
                  userEscrow: userEscrowId,
                  userStakeMintTokenAccount: userAtaId,
                  tokenMetadataProgram: METADATA_PROGRAM_ID,
                })
                .remainingAccounts(remainingAccounts)
                .instruction();
              tx.add(unstakeIx);
            }
            txs.push(tx);
        }
    }
    return txs;
}

export const stakeOld = async (connection, wallet, stakePoolIdentifier, mintIds) => {
    const REWARDS_CENTER_ADDRESS = new PublicKey(VUE_STAKING_PROGRAM_ID)
    const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const provider = new AnchorProvider(connection, wallet)
    const stakingprogram = new PublicKey(VUE_STAKING_PROGRAM_ID);
    const idl = await Program.fetchIdl(stakingprogram, provider);
    const program = new Program(idl, stakingprogram, provider);
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
            utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
            utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        new PublicKey(VUE_STAKING_PROGRAM_ID) // REWARDS_CENTER_ADDRESS
    )[0];
    const txs = [];

    for (const mintId of mintIds) {

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
                        new PublicKey(VUE_STAKING_PROGRAM_ID)
                    )[0],
                    mintTokenAccountId: getAssociatedTokenAddressSync(mintId, wallet.publicKey, true),
                };
            }
        );
        console.log(mints)

        //建立accountDataById，包含上述建立mints裡id的所有資料
        const accountDataById = await fetchIdlAccountDataById(connection, [
            stakePoolId,
            ...mints.map((m) => m.stakeEntryId),
            ...mints.map((m) => findMintManagerId(m.mintId)),
            ...mints.map((m) => findMintMetadataId(m.mintId)),
        ],
            //範例沒有這兩行但這裡需要明確表示
            new PublicKey(VUE_STAKING_PROGRAM_ID),
            idl
        );

        //判斷accountDataById裡獲取資料的內容，先是確認有池的存在
        const stakePoolData = accountDataById[stakePoolId.toString()];
        if (!stakePoolData?.parsed || stakePoolData.type !== "StakePool") {
            throw "Stake pool not found";
        }

        //獲取該池的payment資料
        const stakePaymentInfoData = await fetchIdlAccount(
            connection,
            stakePoolData.parsed.stakePaymentInfo,
            "PaymentInfo",
            idl
        );

        //開始對上面mints裡的所有資料進行判斷，皆為獲取stake pnft所需要的公鑰
        for (const { mintId, mintTokenAccountId, stakeEntryId } of mints) {

            const tx = new Transaction();
            const metadataId = findMintMetadataId(mintId);
            const metadataAccountInfo = accountDataById[metadataId.toString()];
            const metadataInfo = metadataAccountInfo
                ? Metadata.fromAccountInfo(metadataAccountInfo)[0]
                : undefined;
            const authorizationAccounts = remainingAccountsForAuthorization(
                stakePoolData,
                mintId,
                metadataInfo ?? null
                );
            //第一次stake需要init entry
            if (!accountDataById[stakeEntryId.toString()]) {

                const ix = await program
                    .methods.initEntry(wallet.publicKey)
                    .accounts({
                        stakeEntry: stakeEntryId,
                        stakePool: stakePoolId,
                        stakeMint: mintId,
                        stakeMintMetadata: metadataId,
                        payer: wallet.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .remainingAccounts(authorizationAccounts)
                    .instruction();
                tx.add(ix);
            }
            const userEscrowId = PublicKey.findProgramAddressSync(
                [utils.bytes.utf8.encode("escrow"), wallet.publicKey.toBuffer()],
                REWARDS_CENTER_ADDRESS
            )[0];

            //建立獲取payment必要的account
            const remainingAccounts = [
                ...withRemainingAccountsForPaymentInfoSync(
                    tx,
                    wallet.publicKey,
                    stakePaymentInfoData
                ),
            ];
            console.log(remainingAccounts)
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
            if (metadataInfo && metadataInfo.programmableConfig) {

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
            } else {
                
                const stakeIx = await program
                  .methods.stakeEdition(new BN(1))
                  .accounts({
                    stakePool: stakePoolId,
                    stakeEntry: stakeEntryId,
                    stakeMint: mintId,
                    stakeMintEdition: editionId,
                    stakeMintMetadata: metadataId,
                    user: wallet.publicKey,
                    userEscrow: userEscrowId,
                    userStakeMintTokenAccount: mintTokenAccountId,
                    tokenMetadataProgram: METADATA_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                  })
                  .remainingAccounts(remainingAccounts)
                  .instruction();
                tx.add(stakeIx);
            }
            txs.push(tx);
        }
    }
    return txs;
}

export const remainingAccountsForAuthorization = (
    stakePool,
    mintId,
    mintMetadata
  ) => {
    if (
      stakePool.parsed.requiresAuthorization &&
      !mintMetadata?.data.creators?.some((c) =>
        stakePool.parsed.allowedCreators
          .map((c) => c.toString())
          .includes(c.address.toString())
      ) &&
      !(
        mintMetadata?.collection?.key &&
        stakePool.parsed.allowedCollections
          .map((c) => c.toString())
          .includes(mintMetadata?.collection?.key?.toString())
      )
    ) {
      return [
        {
          pubkey: PublicKey.findProgramAddressSync(
            [
              utils.bytes.utf8.encode("stake-authorization"),
              stakePool.pubkey.toBuffer(),
              mintId.toBuffer(),
            ],
            VUE_STAKING_PROGRAM_ID
          )[0],
          isSigner: false,
          isWritable: false,
        },
      ];
    }
    return [];
};
  