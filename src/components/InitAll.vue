<script setup>
import { useWallet } from 'solana-wallets-vue';
import { 
    Transaction,
    PublicKey,
    SystemProgram,
    clusterApiUrl,
    Keypair,
    Message,
    VersionedTransaction,
    AddressLookupTableProgram,
    TransactionMessage,
    sendAndConfirmTransaction,
    SYSVAR_INSTRUCTIONS_PUBKEY
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createTransferInstruction, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID, getMint, getAccount, NATIVE_MINT } from "@solana/spl-token";
import { executeTransaction, fetchIdlAccountDataById, withFindOrInitAssociatedTokenAccount, executeTransactions, chunkArray } from "@cardinal/common";
const anchor = require('@project-serum/anchor');
import { utils, BN, BorshAccountsCoder } from "@coral-xyz/anchor";
import { stakeOld, unstakeOld, unstakeOldtoNew } from "../oldStaking"
import { publicKey } from '@coral-xyz/anchor/dist/cjs/utils';
import { editionBeet } from '@metaplex-foundation/mpl-token-metadata';
import { Metaplex } from '@metaplex-foundation/js';
import { PROGRAM_ID as TOKEN_AUTH_RULES_ID } from "@metaplex-foundation/mpl-token-auth-rules";
const wallet = useWallet();

const stakePoolIdentifier = `TTGG1125`;
const CONFIG_VALUE_LIMIT = 790;
const REWARDS_CENTER_ADDRESS = new PublicKey("ErbSL4EyyTrYPoVeUrs7VPpcf2LBS7mWbSv4ivv538hA");

const mintId = new PublicKey("FXW1U4p5Xn1tGpyzMbQsWYRHwB6cX3Nz7N14DMEixAuF")
const masterId = new PublicKey("36fLo1rHBQ1ZgAnsrBZN5Po22MLVQu4EeFjiozhPzvSv")
const rewardmintId = new PublicKey("D8J6gcTSLPwXS9h4afZvDEQr2qGxscVfUPnrfbHQxhzJ")
const col_1 = new PublicKey('8E8BHMvZiKq7q9xn1dw8rbZr7Vf2uPUdshaNU5mmFeZ8')

const connection = new anchor.web3.Connection(clusterApiUrl('devnet'))
const provider = new anchor.AnchorProvider(connection, wallet)
let idl = anchor.Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);

wallet.publicKey = wallet.publicKey.value ?? wallet.publicKey;
wallet.signAllTransactions = wallet.signAllTransactions.value ?? wallet.signAllTransactions

const stakePoolId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode('stake-pool'),
    utils.bytes.utf8.encode(stakePoolIdentifier),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
const paymentInfoId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode("payment-info"),
    utils.bytes.utf8.encode("test-2"),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
const stakeAuthorizationId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode("stake-authorization"),
    stakePoolId.toBuffer(),
    mintId.toBuffer(),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
const rewardDistributorId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode("reward-distributor"),
    stakePoolId.toBuffer(),
    //(identifier ?? new BN(0)).toArrayLike(Buffer, "le", 8),
    new BN(0).toArrayLike(Buffer, "le", 8)
    ],
    REWARDS_CENTER_ADDRESS
)[0];
const discountId = PublicKey.findProgramAddressSync(
    [
        utils.bytes.utf8.encode("discount-prefix"),
        utils.bytes.utf8.encode(stakePoolIdentifier),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
const configEntryId = PublicKey.findProgramAddressSync(
    [
        anchor.utils.bytes.utf8.encode("config-entry"), 
        Buffer.from("", "utf-8"), 
        Buffer.from(stakePoolIdentifier, "utf-8")
    ],
    REWARDS_CENTER_ADDRESS
)[0];
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

let isFungible = false;

// let distributor = await fetchIdlAccountDataById(
//     connection,
//     [rewardDistributorId],
//     REWARDS_CENTER_ADDRESS,
//     idl
// )
// let stakePool =await fetchIdlAccountDataById(
//     connection,
//     [stakePoolId],
//     REWARDS_CENTER_ADDRESS,
//     idl
// )
// let reward =await fetchIdlAccountDataById(
//     connection,
//     [rewardDistributorId],
//     REWARDS_CENTER_ADDRESS,
//     idl
// )

async function init_pool () {
    
    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);

    const usdc_mint = new PublicKey("D8J6gcTSLPwXS9h4afZvDEQr2qGxscVfUPnrfbHQxhzJ")
    const payer_mint_token_account = await getOrCreateAssociatedTokenAccount(connection, wallet.publicKey, usdc_mint, wallet.publicKey)
    const owner_mint_token_account = await getOrCreateAssociatedTokenAccount(connection, wallet.publicKey, usdc_mint, new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"))
    
    const discountId = PublicKey.findProgramAddressSync(
        [
            anchor.utils.bytes.utf8.encode("discount-prefix"),
            anchor.utils.bytes.utf8.encode(stakePoolIdentifier),
        ],
        REWARDS_CENTER_ADDRESS
    )[0];

    const tx = new Transaction();

    const discountix = await program.methods
        .initDiscount({
            discountStr: "0",
            authority: wallet.publicKey.value,
            identifier: stakePoolIdentifier
        })
        .accounts({
            discountData: discountId,
            nftMint: null,
            nftTokenAccount: null,
            metadataAccount: null,
            payer: wallet.publicKey.value,
            systemProgram: SystemProgram.programId,
        })
        .instruction();
    tx.add(discountix);

    const remain = [
        {
            pubkey: discountId,
            isSigner: false,
            isWritable: false,
        },
    ]

    const init_ix = await program.methods
        .initPool({
            identifier: stakePoolIdentifier,
            allowedCollections: [],
            allowedCreators: [],
            requiresAuthorization: false,
            authority: new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"),
            resetOnUnstake: false,
            cooldownSeconds: null,
            minStakeSeconds: null,
            endDate: null,
            stakePaymentInfo: paymentInfoId,
            unstakePaymentInfo: paymentInfoId,
        })
        .accounts({
            stakePool: stakePoolId,
            owner: new PublicKey("2JeNLSrJkSaWoFoSQkb1YsxC1dXSaA1LTLjpakzb9SBf"),
            usdcMint: usdc_mint,
            payerMintTokenAccount: payer_mint_token_account.address,
            ownerMintTokenAccount: owner_mint_token_account.address,
            payer: wallet.publicKey.value,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID
        })
        .remainingAccounts(remain)
        .instruction();

    const update_ix = await program.methods
        .updatePool({
            allowedCollections: [],
            allowedCreators: [],
            requiresAuthorization: false,
            authority: new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"),
            resetOnUnstake: false,
            cooldownSeconds: null,
            minStakeSeconds: null,
            endDate: null,
            stakePaymentInfo: paymentInfoId,
            unstakePaymentInfo: paymentInfoId,
        })
        .accounts({
            stakePool: stakePoolId,
            payer: wallet.publicKey.value,
            authority: wallet.publicKey.value,
            systemProgram: SystemProgram.programId
        }).instruction()

    tx.add(init_ix);

    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);
    const stakePool =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    console.log(stakePool)
}
async function InitConfig () {
    
    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
    
    // Config Info
    const colors =  {
        primary: "#Tf0001",
        secondary: "#Tf0002",
        accent: "#Tf0003",
        fontColor: "#Tf0004",
        fontColorSecondary: "#Tf0005",
        backgroundSecondary: "#Tf0006",
        fontColorTertiary: "#Tf0007"
    }
    const config = {
        name: "DDD pool",
        displayName: "Display",
        description: "This is a description",
        imageUrl: "https://ipfs.io/ipfs/QmVHxnkmEyTN6QT1ULb8yLYiJbb8qSzFAC6EAVCTKUw7bb?filename=lulu.jpeg",
        stakePoolAddress: new PublicKey(stakePoolId),
        colors: colors
    }

    // 因為資料是合併成字串的關係，無法限制輸入的name在program是唯一
    const configList = await full_config(idl, connection);

    let latest_config = "";

    for (const config of configList) {

        const config_parsed = config.parsed.value.match(/{[^{}]*}/g)
        // latest_config = JSON.parse(config_parsed[config_parsed.length - 1]);
    }

    const { ...otherObject } = config // stakePoolAddress: _,
    const configString = JSON.stringify({
        stakePoolAddress: stakePoolId.toString(),//Object.keys(stakePool)[0].toString(),
        ...otherObject,
    })
    const configChunks = chunkArray(
        configString.split(''),
        CONFIG_VALUE_LIMIT
    ).map((chunk) => chunk.join(''))

    const tx = new Transaction();
    // const init_ix = await program.methods
    //     .initConfigEntry({
    //         prefix: Buffer.from(""),
    //         key: Buffer.from(stakePoolIdentifier),
    //         value: configChunks[0],
    //         extends: [],
    //     })
    //     .accountsStrict({
    //         configEntry: configEntryId,
    //         authority: provider.wallet.publicKey,
    //         systemProgram: SystemProgram.programId,
    //     })
    //     .remainingAccounts([
    //         {
    //             pubkey: new PublicKey(stakePoolId),
    //             isSigner: false,
    //             isWritable: false,
    //         },
    //     ])
    //     .instruction();
    // tx.add(init_ix);
    const updateIx = await program.methods
        .updateConfigEntry({
            value: configChunks[0],
            extends: [],
            append: true,
        })
        .accountsStrict({
            configEntry: configEntryId,
            authority: wallet.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
            {
                pubkey: new PublicKey("JCMeeppVifrJ2Npy8h2KbrmFGM4m1CU1bkMieJL67rGg"),
                isSigner: false,
                isWritable: false,
            },
        ])
        .instruction()
    tx.add(updateIx);

    // const exec = await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);

    const config_data = await fetchIdlAccountDataById(
        connection,
        [configEntryId],
        REWARDS_CENTER_ADDRESS,
        idl
    );
    const config_parsed = config.parsed.value.match(/{[^{}]*}/g)
    // latest_config = JSON.parse(config_parsed[config_parsed.length - 1]);
    const Config = config_data[Object.keys(config_data)[0]]
    const CongfigData = Config.parsed.value.match(/\{[^}]*\}/g)
    const New_ConafigData = CongfigData[CongfigData.length - 1]
    console.log(Config)
    console.log(JSON.parse(New_ConafigData+"}"))
}
async function init_payment () {//& update

    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();

    const update_ix = await program.methods
        .updatePaymentInfo({
            authority: new PublicKey("2JeNLSrJkSaWoFoSQkb1YsxC1dXSaA1LTLjpakzb9SBf"),
            paymentAmount: new BN(2_000_000),
            paymentMint: PublicKey.default,
            paymentShares: [
                {
                address: new PublicKey("7PTosH4BNpuUHi4QvS2WtJLRQhDbB8udMbLRv9rc2R5B"),
                basisPoints: 10000,
                },
            ],
        })
        .accounts({ 
            paymentInfo: paymentInfoId, 
            authority : new PublicKey("2JeNLSrJkSaWoFoSQkb1YsxC1dXSaA1LTLjpakzb9SBf"),
            payer: wallet.publicKey.value ,
            systemProgram: SystemProgram.programId})
        .instruction();
    // const init_ix = await program.methods
    //     .initPaymentInfo({
    //         authority: wallet.publicKey,
    //         identifier: stakePoolIdentifier,
    //         paymentAmount: new BN(200_000),
    //         paymentMint: PublicKey.default,
    //         paymentShares: [
    //             {
    //             address: new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"),
    //             basisPoints: 10000,
    //             },
    //         ],
    //     })
    //     .accounts({ 
    //         paymentInfo: paymentInfoId, 
    //         payer: wallet.publicKey,
    //         systemProgram: SystemProgram.programId})
    //     .instruction();
    tx.add(update_ix)
    // await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);

    const paymentInfo =await fetchIdlAccountDataById(
        connection,
        [paymentInfoId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    console.log(paymentInfo)
    // console.log('payment info id :',paymentInfoId.toString())
    // console.log('stake pool id :',stakePoolId.toString())
}
async function Authorize_mint () {

    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();

    tx.add(
    await program.methods
      .authorizeMint(mintId)
      .accounts({
        stakePool: stakePoolId,
        stakeAuthorizationRecord: stakeAuthorizationId,
        authority:new PublicKey('F4rMWNogrJ7bsknYCKEkDiRbTS9voM7gKU2rcTDwzuwf'),
        payer: wallet.publicKey.value,
        systemProgram: SystemProgram.programId,
      })
      .instruction()
    );

    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);
    const pool =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    console.log(pool) 
}
async function update_pool () {

    const program = new anchor.Program(await idl, REWARDS_CENTER_ADDRESS, provider);

    const tx = new Transaction();
    tx.add( 
        await program.methods
        .updatePool({
            allowedCollections: [],
            allowedCreators: [],
            requiresAuthorization: false,
            authority: new PublicKey("F4rMWNogrJ7bsknYCKEkDiRbTS9voM7gKU2rcTDwzuwf"),
            resetOnUnstake: false,
            cooldownSeconds: null,
            minStakeSeconds: null,
            endDate: null,
            stakePaymentInfo: paymentInfoId,
            unstakePaymentInfo: paymentInfoId,
        })
        .accounts({
            stakePool: stakePoolId,
            payer: wallet.publicKey,
            authority: new PublicKey("F4rMWNogrJ7bsknYCKEkDiRbTS9voM7gKU2rcTDwzuwf"),
            systemProgram: SystemProgram.programId
        }).instruction()
    );

    const exec = await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);

    console.log(tx)
}
async function init_reward_distribution () {

    const program = new anchor.Program(await idl, REWARDS_CENTER_ADDRESS, provider);

    const tx = new Transaction();
    const init_ix = await program.methods
        .initRewardDistributor({
            identifier: new BN(0),
            rewardAmount: new BN(2100),
            rewardDurationSeconds: new BN(1),
            supply: null,
            defaultMultiplier: new BN(1),
            multiplierDecimals: 0,
            maxRewardSecondsReceived: null,
            claimRewardsPaymentInfo: paymentInfoId,
        })
        .accounts({
            rewardDistributor: rewardDistributorId,
            stakePool: stakePoolId,
            rewardMint: rewardmintId,
            authority: wallet.publicKey.value,
            payer: wallet.publicKey.value,
        })
        .instruction();

    const update_ix = await program.methods
        .updateRewardDistributor({
            rewardAmount: new BN(1000),//
            rewardDurationSeconds: new BN(1),//
            defaultMultiplier: new BN(1),//
            multiplierDecimals: 0,//
            maxRewardSecondsReceived: null,
            claimRewardsPaymentInfo: paymentInfoId,
        })
        .accounts({
            rewardDistributor: rewardDistributorId,
            authority: provider.wallet.publicKey.value,
        })
        .instruction();

    // tx.add(update_ix);
    console.log(tx)
    // transfer fund
    const userRewardMintAta = getAssociatedTokenAddressSync(
        rewardmintId,
        wallet.publicKey
    );
    const rewardDistributorAtaId = await withFindOrInitAssociatedTokenAccount(
        tx,
        connection,
        rewardmintId,
        rewardDistributorId,
        wallet.publicKey,
        true
    );
    tx.add(
        createTransferInstruction(
        userRewardMintAta,
        rewardDistributorAtaId,
        wallet.publicKey,
        //117600000*(10**6)
        100_000_000
        )
    );

    await executeTransaction(connection, tx, provider.wallet.wallet.value);
}
async function InitUserAttribute () {

    const nftmint = await getMint(connection,mintId)
    const userattributeId = PublicKey.findProgramAddressSync(
        [
            anchor.utils.bytes.utf8.encode('user-attribute'),
            anchor.utils.bytes.utf8.encode(stakePoolIdentifier),
            nftmint.address.toBuffer()
        ],
        REWARDS_CENTER_ADDRESS
    )[0];

    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);

    const metaplex = Metaplex.make(connection);
    const nftmetadata = await metaplex.nfts().findByMint({mintAddress: mintId})
    const attribute = nftmetadata.json?.attributes.map(item => [item.trait_type, item.value]);
    console.log(attribute)
    const tx = new Transaction();
    const ix = await program.methods
        .initUserAttribute({
            collection: col_1,
            attribute: attribute,
            identifier: stakePoolIdentifier,
            authority: provider.wallet.publicKey,
        })
        .accounts({
            userAttribute: userattributeId,
            userMint: nftmint.address,
            payer: provider.wallet.publicKey,
            systemProgram:  SystemProgram.programId
        })
        .instruction();
    tx.add(ix)
    await executeTransaction(connection, tx, provider.wallet.wallet.value);

    const userattribute = await fetchIdlAccountDataById(
        connection,
        [userattributeId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    console.log('user',userattribute[Object.keys(userattribute)[0]])
}
async function InitCollectionMul () {

    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();
    const ix = await program.methods
    .initCollectionMul({
        collectionsMultiply: [col_1],
        multiplyData: [
            [7, 100],
        ],
        identifier: stakePoolIdentifier,
        authority: new PublicKey('F4rMWNogrJ7bsknYCKEkDiRbTS9voM7gKU2rcTDwzuwf')
    })
    .accounts({
        collectionMul: collectionMulId,
        stakePool: stakePoolId,
        payer: wallet.publicKey.value,
        systemProgram: SystemProgram.programId,
    })
    .instruction();

    tx.add(ix)
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value)
    const collectionMul =await fetchIdlAccountDataById(
        connection,
        [collectionMulId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    console.log(collectionMul)
}
async function InitAttributeMul () {

    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();
    const ix = await program.methods
        .initAttributeMul({
            attributeMultiply: [[col_1.toString(), 'char', '謀略者']],
            multiplyData: [
                [5, 100],
            ],
            identifier: stakePoolIdentifier,
            authority: provider.wallet.publicKey
        })
        .accounts({
            attributeMul: attributeMulId,
            stakePool: stakePoolId,
            owner: new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"),
            payer: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    tx.add(ix)
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value)
    const attributeMul =await fetchIdlAccountDataById(
        connection,
        [attributeMulId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    console.log(attributeMul)
}

async function staking () {

    const tx = await stakeOld(connection, wallet, stakePoolIdentifier, [{mintId: mintId}])
    console.log('tx: ',tx)

    await executeTransactions(connection, [tx], provider.wallet.wallet.value);
}
async function unstaking () {

    const nftmint = await getMint(connection,mintId)
    const userattribute = PublicKey.findProgramAddressSync(
        [
            anchor.utils.bytes.utf8.encode('user-attribute'),
            anchor.utils.bytes.utf8.encode(stakePoolIdentifier),
            nftmint.address.toBuffer()
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    
    // const tx = await unstakeOld(connection, wallet, stakePoolIdentifier, [{mintId: mintId}],[rewardDistributorId])
    const tx = await unstakeOldtoNew(connection, wallet, stakePoolIdentifier, [{mintId: mintId}],[rewardDistributorId], userattribute)

    await executeTransactions(connection, tx, provider.wallet.wallet.value)
}
async function Check() {

    const isFungible = false;
    const stakeEntryId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("stake-entry"),
        stakePoolId.toBuffer(),
        mintId.toBuffer(),
        wallet.publicKey.value && isFungible ? wallet.publicKey.value.toBuffer() : PublicKey.default.toBuffer(),
        ],
        REWARDS_CENTER_ADDRESS
    )[0];

    const lookupTableAddress = new PublicKey("7iEQSaYZt71fPiHE6KJ8m1YTHwbftxjfqnA2GERuhtQ4")
    const lookupTableAccount = (await connection.getAddressLookupTable(lookupTableAddress));
    console.log(lookupTableAccount)

    console.log(lookupTableAccount.value.state)

}

async function lookUpTable () {

    idl = await idl
    const recentSlot = await provider.connection.getSlot();

    const [loookupTableInstruction, lookupTableAddress] =
        AddressLookupTableProgram.createLookupTable({
        authority: wallet.publicKey,
        payer: wallet.publicKey,
        recentSlot,
        });

    // add ix on-chain
    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: wallet.publicKey,
        authority: wallet.publicKey,
        lookupTable: lookupTableAddress,
        addresses: [
            SystemProgram.programId,
            TOKEN_PROGRAM_ID,
            new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"), // METADATA_PROGRAM_ID
            new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"), // owner for payment
            SYSVAR_INSTRUCTIONS_PUBKEY,
            TOKEN_AUTH_RULES_ID
        ],
    });
    console.log('create')

    await createAndSendV0Tx([loookupTableInstruction, extendInstruction])
}
async function createAndSendV0Tx(txInstructions) {

    // Step 1 - Fetch Latest Blockhash
    let latestBlockhash = await connection.getLatestBlockhash('finalized');
    console.log("✅ - Fetched latest blockhash. Last valid height:", latestBlockhash.lastValidBlockHeight);

    // Step 2 - Generate Transaction Message
    const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: txInstructions
    }).compileToV0Message();

    console.log("✅ - Compiled transaction message");
    const transactionV0 = new VersionedTransaction(messageV0);

    console.log("execute")
    await executeTransactions(connection, [transactionV0], provider.wallet.wallet.value)
    
    console.log('🎉 Transaction succesfully confirmed!');
}

async function full_config(idl, connection) {

    const programAccounts = await connection.getProgramAccounts(
        REWARDS_CENTER_ADDRESS,
        {
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: utils.bytes.bs58.encode(
                            BorshAccountsCoder.accountDiscriminator('ConfigEntry')
                        ),
                    },
                },
            ],
        }
    );
    const configDatas = [];
    const coder = new BorshAccountsCoder(idl);

    programAccounts.forEach((account) => {
        try {
            const entryData = coder.decode('ConfigEntry', account.account.data);
            if (entryData) {
                configDatas.push({
                    ...account,
                    parsed: entryData,
                });
            }
        } catch (e) {
            // eslint-disable-next-line no-empty
        }
    });

    return configDatas
}
</script>

<template>
    <div>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="Check">
            <span>
                Check
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="init_pool">
            <span>
                Init Pool
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="init_payment">
            <span>
                Init Payment
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitUserAttribute">
            <span>
                Init userattribute
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitCollectionMul">
            <span>
                Init collection mul
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitAttributeMul">
            <span>
                Init attribute mul
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitConfig">
            <span>
               Init Config
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="Authorize_mint">
            <span>
               Authorize mint
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="update_pool">
            <span>
               Update pool
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="init_reward_distribution">
            <span>
                Init reward distribution
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="staking">
            <span>
                stake
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="unstaking">
            <span>
                unstake
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="lookUpTable">
            <span>
                look up table
            </span>
        </button>
</div>
</template>
