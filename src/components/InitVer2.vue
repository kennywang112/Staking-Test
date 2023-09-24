<script setup>
import { useWallet } from 'solana-wallets-vue'
import { 
    Transaction, 
    PublicKey,
    SystemProgram,
    clusterApiUrl 
} from '@solana/web3.js';
import { 
    executeTransaction,
    executeTransactions, 
    withFindOrInitAssociatedTokenAccount, 
    fetchIdlAccountDataById,
    findMintMetadataId
 } from "@cardinal/common";
const anchor = require('@project-serum/anchor');
import { utils, BN, BorshAccountsCoder } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, createTransferInstruction, getAccount, getMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { stake, unstake } from "../useStaking"
import { Metaplex } from '@metaplex-foundation/js';
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";

const wallet = useWallet();

let hacoIdentifier = `TTG0905`;//this is for the owner
let stakePoolIdentifier = `abc`;//this is for the client
let REWARDS_CENTER_ADDRESS = new PublicKey("7qvLBUh8LeRZrd35Df1uoV5pKt4oxgmJosKZr3yRYsXQ")

let mintId = new PublicKey('8cSVigyxGxc5EzUdpWDoEvhVtXKrucYHg6k8cPrHciai')//DbTgwGckx2rQwEhMcECzt4QwD2rphkxSeyUaLTeBk5zh
let rewardmintId = new PublicKey('D8J6gcTSLPwXS9h4afZvDEQr2qGxscVfUPnrfbHQxhzJ')
let col_1 = new PublicKey('8E8BHMvZiKq7q9xn1dw8rbZr7Vf2uPUdshaNU5mmFeZ8')
let col_2 = new PublicKey('GWqTyimCmP7oFSP2uzxfAGWoCkv38sKPF6jkYEiFqJBz')

let connection = new anchor.web3.Connection(clusterApiUrl('devnet'))
let provider = new anchor.AnchorProvider(connection, wallet)
let idl = anchor.Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);

let authority = new PublicKey('F4rMWNogrJ7bsknYCKEkDiRbTS9voM7gKU2rcTDwzuwf')

wallet.publicKey = wallet.publicKey.value ?? wallet.publicKey;
wallet.signAllTransactions = wallet.signAllTransactions.value ?? wallet.signAllTransactions

let stakePoolId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode('stake-pool'),
    utils.bytes.utf8.encode(stakePoolIdentifier),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
let paymentInfoId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode("payment-info"),
    utils.bytes.utf8.encode(hacoIdentifier),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
let rewardDistributorId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode("reward-distributor"),
    stakePoolId.toBuffer(),
    new BN(0).toArrayLike(Buffer, "le", 8)
    ],
    REWARDS_CENTER_ADDRESS
)[0];
let collectionMulId = PublicKey.findProgramAddressSync(
    [
        utils.bytes.utf8.encode('collection-mul'),
        utils.bytes.utf8.encode(stakePoolIdentifier),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
let attributeMulId = PublicKey.findProgramAddressSync(
    [
        utils.bytes.utf8.encode('attribute-mul'),
        utils.bytes.utf8.encode(stakePoolIdentifier),
    ],
    REWARDS_CENTER_ADDRESS
)[0];

const SOL_PAYMENT_INFO = new PublicKey("7qvLBUh8LeRZrd35Df1uoV5pKt4oxgmJosKZr3yRYsXQ");//no use

async function InitPool () {

    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
    
    const tx = new Transaction();
    const ix = await program.methods
    .initPool({
        identifier: stakePoolIdentifier,
        allowedCollections: [],
        allowedCreators: [],
        requiresAuthorization: false,
        authority: provider.wallet.publicKey,
        resetOnUnstake: false,
        cooldownSeconds: null,
        minStakeSeconds: null,
        endDate: null,
        stakePaymentInfo: SOL_PAYMENT_INFO,
        unstakePaymentInfo: SOL_PAYMENT_INFO,
    })
    .accounts({
        owner: new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"),
        stakePool: stakePoolId,
        payer: wallet.publicKey.value,
        systemProgram: SystemProgram.programId,
    })
    .instruction();

    tx.add(ix);

    console.log(tx)
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);

    const stakePool =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    console.log(stakePool[Object.keys(stakePool)[0]])
}
async function InitCollectionMul () {

    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();
    const ix = await program.methods
    .initCollectionMul({
        collectionsMultiply: [col_1],
        multiplyData: [
            [1.5, 5],
        ],
        identifier: stakePoolIdentifier,
        authority: authority
    })
    .accounts({
        collectionMul: collectionMulId,
        stakePool: stakePoolId,
        payer: authority,
        systemProgram: SystemProgram.programId,
    })
    .instruction(collectionMulId);

    tx.add(ix)
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value)

    console.log(collectionMulId)
}
async function InitAttributeMul () {

    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();
    const ix = await program.methods
    .initAttributeMul({
      attributeMultiply: [['time horizon', 'WANTED']],
      multiplyData: [
        [16, 5],
      ],
      identifier: stakePoolIdentifier,
      authority: provider.wallet.publicKey
    })
    .accounts({
      attributeMul: attributeMulId,
      stakePool: stakePoolId,
      payer: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .instruction(collectionMulId);

    tx.add(ix)
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value)
    console.log(tx)
}
async function InitPayment () {

    const program = new anchor.Program(await idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();
    const ix = await program.methods
        .initPaymentInfo({
            authority: wallet.publicKey,
            identifier: hacoIdentifier,
            paymentAmount: new BN(200000),
            paymentMint: PublicKey.default,
            paymentShares: [
                {
                address: wallet.publicKey,
                basisPoints: 10000,
                },
            ],
        })
        .accounts({ 
            paymentInfo: paymentInfoId, 
            payer: wallet.publicKey ,
            systemProgram: SystemProgram.programId})
        .instruction();

    tx.add(ix)
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);

    console.log('payment info id :',paymentInfoId.toString())
    console.log('stake pool id :',stakePoolId.toString())
}
async function InitRewardDistribution () {

    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();

    const ix = await program.methods
    .initRewardDistributor({
        identifier: new BN(0),
        rewardAmount: new BN(2100),
        rewardDurationSeconds: new BN(1),
        supply: null,
        defaultMultiplier: new BN(1),
        multiplierDecimals: 0,
        maxRewardSecondsReceived: null,
    })
    .accounts({
        rewardDistributor: rewardDistributorId,
        stakePool: stakePoolId,
        rewardMint: rewardmintId,
        authority: provider.wallet.publicKey.value,
        payer: provider.wallet.publicKey.value,
    })
    .instruction();

    tx.add(ix);

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
        10000000000
        )
    );

    await executeTransaction(connection, tx, provider.wallet.wallet.value);

    console.log(tx)
}

async function UpdateCollectionMul () {

    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();
    const ix = await program.methods
    .updateCollectionMul({
        collectionsMultiply:[col_1, col_2],
        multiplyData: [
            [18, 3],
            [15, 6]
        ],
        identifier: stakePoolIdentifier,
        authority: authority
    })
    .accounts({
        authority: provider.wallet.publicKey,
        collectionMul: collectionMulId,
        stakePool: stakePoolId,
        payer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
    })
    .instruction();

    tx.add(ix)
    await executeTransaction(connection, tx, provider.wallet.wallet.value)
    console.log(ix)
}
async function UpdatePool () {

    const program = new anchor.Program(await idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();

    tx.add( 
        await program.methods
        .updatePool({
            allowedCollections: [],
            allowedCreators: [],
            requiresAuthorization: true,
            authority: wallet.publicKey.value,
            resetOnUnstake: false,
            cooldownSeconds: null,
            minStakeSeconds: null,
            endDate: null,
            stakePaymentInfo: SOL_PAYMENT_INFO,
            unstakePaymentInfo: SOL_PAYMENT_INFO,
        })
        .accounts({
            stakePool: stakePoolId,
            payer: wallet.publicKey.value,
            authority: wallet.publicKey.value,
            systemProgram: SystemProgram.programId
        }).instruction()
    );

    console.log(paymentInfoId)

    const exec = await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);

}

async function Stake () {

    const metaplex = Metaplex.make(connection);
    const nftmetadata = await metaplex.nfts().findByMint({mintAddress: mintId})
    const attribute = nftmetadata.json?.attributes.map(item => [item.trait_type, item.value]);

    const tx = await stake(connection, wallet, stakePoolIdentifier, [{mintId: mintId}], [attribute])
    await executeTransactions(connection, tx, provider.wallet.wallet.value);

    console.log(attribute)

}
async function UnStake () {

    const metaplex = Metaplex.make(connection);
    const nftmetadata = await metaplex.nfts().findByMint({mintAddress: mintId})
    const attribute = nftmetadata.json?.attributes.map(item => [item.trait_type, item.value]);

    const tx = await unstake(connection, wallet, stakePoolIdentifier, [{mintId: mintId}],[rewardDistributorId], attributeMulId)

    await executeTransactions(connection, tx, provider.wallet.wallet.value);

    console.log(tx)
}

async function ClosePool () {

    idl = await idl// if not doing this, can't get the parsed of the pool
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);

    const tx = new Transaction();
    const ix = await program.methods
    .closeStakePool()
    .accountsStrict({
        stakePool: stakePoolId,
        authority: new PublicKey('F4rMWNogrJ7bsknYCKEkDiRbTS9voM7gKU2rcTDwzuwf')
    })
    .instruction()
    tx.add(ix)

    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);
    const userAtaId = getAssociatedTokenAddressSync(
        mintId,
        new PublicKey('Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG')
    );
    const nft_info = await getAccount(connection, userAtaId)
    console.log(nft_info)

}
async function Check() {

    let isFungible = false;
    let stakeEntryId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("stake-entry"),
        stakePoolId.toBuffer(),
        mintId.toBuffer(),
        wallet.publicKey.value && isFungible ? wallet.publicKey.value.toBuffer() : PublicKey.default.toBuffer(),
        ],
        REWARDS_CENTER_ADDRESS
    )[0];

    idl = await idl

    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);

    const stakePool =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    const entry = await fetchIdlAccountDataById(
        connection,
        [stakeEntryId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    const reward = await fetchIdlAccountDataById(
        connection,
        [rewardDistributorId],
        REWARDS_CENTER_ADDRESS,
        idl
    )

    // console.log('last staked at :',entry[Object.keys(entry)[0]].parsed.lastStakedAt.words[0])
    // console.log('last updated at :',entry[Object.keys(entry)[0]].parsed.lastUpdatedAt.words[0])
    // console.log("total staked second :",entry[Object.keys(entry)[0]].parsed.totalStakeSeconds.words[0])

    // console.log(reward[Object.keys(reward)[0]].parsed.rewardAmount.toString()/(10**6))

    // const metadataId = findMintMetadataId(mintId);

    console.log(reward[Object.keys(reward)[0]].parsed.rewardMint)
}
async function CC() {

    const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

    const metaplex = Metaplex.make(connection);
    const nftmetadata = await metaplex.nfts().findByMint({mintAddress: mintId})

    console.log(nftmetadata)

    const metadataPda = metaplex.nfts().pdas().metadata({ mint: mintId });
    
    console.log(metadataPda)
    const ata = getAssociatedTokenAddressSync(mintId, wallet.publicKey)
    const meta = await getAccount(connection, ata)
    console.log(meta)
}

async function FindAllPool () {

    // const wallet_pool = [];

    const allpools = await getStakePoolsByAuthority(connection,provider.wallet.publicKey)
    // for(const pool of allpools) {
    //     if(pool.parsed.authority.toString() == provider.wallet.publicKey.toString()) {
    //         wallet_pool.push(pool)
    //     }
    // }
    console.log(allpools)
}

async function getStakePoolsByAuthority(connection, user) {
    const STAKE_POOL_IDL = {
        "version": "1.0.0",
        "name": "trading_train_center",
        "instructions": [
            {
            "name": "initPool",
            "accounts": [
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "owner",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "ix",
                "type": {
                    "defined": "InitPoolIx"
                }
                }
            ]
            },
            {
            "name": "updatePool",
            "accounts": [
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": false,
                "isSigner": true
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "ix",
                "type": {
                    "defined": "UpdatePoolIx"
                }
                }
            ]
            },
            {
            "name": "closeStakePool",
            "accounts": [
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": true,
                "isSigner": true
                }
            ],
            "args": []
            },
            {
            "name": "initCollectionMul",
            "accounts": [
                {
                "name": "collectionMul",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "ix",
                "type": {
                    "defined": "InitCollectionMulIx"
                }
                }
            ]
            },
            {
            "name": "updateCollectionMul",
            "accounts": [
                {
                "name": "collectionMul",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": false,
                "isSigner": true
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "ix",
                "type": {
                    "defined": "UpdateCollectionMulIx"
                }
                }
            ]
            },
            {
            "name": "initAttributeMul",
            "accounts": [
                {
                "name": "attributeMul",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "ix",
                "type": {
                    "defined": "InitAttributeMulIx"
                }
                }
            ]
            },
            {
            "name": "initEntry",
            "accounts": [
                {
                "name": "stakeEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeMint",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "stakeMintMetadata",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "ix",
                "type": {
                    "defined": "InitEntryIx"
                }
                }
            ]
            },
            {
            "name": "updateTotalStakeSeconds",
            "accounts": [
                {
                "name": "stakeEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "updater",
                "isMut": true,
                "isSigner": true
                }
            ],
            "args": []
            },
            {
            "name": "resetStakeEntry",
            "accounts": [
                {
                "name": "stakePool",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "stakeEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": true,
                "isSigner": true
                }
            ],
            "args": []
            },
            {
            "name": "resizeStakeEntry",
            "accounts": [
                {
                "name": "stakeEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": []
            },
            {
            "name": "closeStakeEntry",
            "accounts": [
                {
                "name": "stakePool",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "stakeEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": true,
                "isSigner": true
                }
            ],
            "args": []
            },
            {
            "name": "stakePnft",
            "accounts": [
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeMint",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "stakeMintMetadata",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeMintEdition",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "stakeTokenRecordAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authorizationRules",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "user",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "userEscrow",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "userStakeMintTokenAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "tokenMetadataProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "sysvarInstructions",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "authorizationRulesProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "tokenProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": []
            },
            {
            "name": "unstakePnft",
            "accounts": [
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeMint",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "stakeMintMetadata",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeMintEdition",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "stakeTokenRecordAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authorizationRules",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "user",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "userEscrow",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "userStakeMintTokenAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "tokenMetadataProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "sysvarInstructions",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "authorizationRulesProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "tokenProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": []
            },
            {
            "name": "stakeCcs",
            "accounts": [
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeMint",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "stakeMintMetadata",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "stakeMintManager",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeMintManagerRuleset",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "user",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "userEscrow",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "userStakeMintTokenAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "creatorStandardProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "tokenProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "amount",
                "type": "u64"
                }
            ]
            },
            {
            "name": "unstakeCcs",
            "accounts": [
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeMint",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "stakeMintManager",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "user",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "userEscrow",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "userStakeMintTokenAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "creatorStandardProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "tokenProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": []
            },
            {
            "name": "authorizeMint",
            "accounts": [
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeAuthorizationRecord",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "mint",
                "type": "publicKey"
                }
            ]
            },
            {
            "name": "deauthorizeMint",
            "accounts": [
                {
                "name": "stakePool",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeAuthorizationRecord",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": true,
                "isSigner": true
                }
            ],
            "args": []
            },
            {
            "name": "initRewardDistributor",
            "accounts": [
                {
                "name": "rewardDistributor",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakePool",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "rewardMint",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "tokenProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "ix",
                "type": {
                    "defined": "InitRewardDistributorIx"
                }
                }
            ]
            },
            {
            "name": "updateRewardDistributor",
            "accounts": [
                {
                "name": "rewardDistributor",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": false,
                "isSigner": true
                }
            ],
            "args": [
                {
                "name": "ix",
                "type": {
                    "defined": "UpdateRewardDistributorIx"
                }
                }
            ]
            },
            {
            "name": "closeRewardDistributor",
            "accounts": [
                {
                "name": "rewardDistributor",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakePool",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "rewardMint",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "rewardDistributorTokenAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authorityTokenAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "signer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "tokenProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": []
            },
            {
            "name": "reclaimFunds",
            "accounts": [
                {
                "name": "rewardDistributor",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "rewardDistributorTokenAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authorityTokenAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "tokenProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "amount",
                "type": "u64"
                }
            ]
            },
            {
            "name": "initRewardEntry",
            "accounts": [
                {
                "name": "rewardEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeEntry",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "rewardDistributor",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": []
            },
            {
            "name": "closeRewardEntry",
            "accounts": [
                {
                "name": "rewardDistributor",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "rewardEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": true,
                "isSigner": true
                }
            ],
            "args": []
            },
            {
            "name": "updateRewardEntry",
            "accounts": [
                {
                "name": "rewardEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "rewardDistributor",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": false,
                "isSigner": true
                }
            ],
            "args": [
                {
                "name": "ix",
                "type": {
                    "defined": "UpdateRewardEntryIx"
                }
                }
            ]
            },
            {
            "name": "claimRewards",
            "accounts": [
                {
                "name": "rewardEntry",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "rewardDistributor",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeEntry",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "stakePool",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "rewardMint",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "userRewardMintTokenAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "rewardDistributorTokenAccount",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "stakeMintMetadata",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "collectionMul",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "attributeMul",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "user",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "tokenProgram",
                "isMut": false,
                "isSigner": false
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": []
            },
            {
            "name": "initPaymentInfo",
            "accounts": [
                {
                "name": "paymentInfo",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "ix",
                "type": {
                    "defined": "InitPaymentInfoIx"
                }
                }
            ]
            },
            {
            "name": "updatePaymentInfo",
            "accounts": [
                {
                "name": "paymentInfo",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": false,
                "isSigner": true
                },
                {
                "name": "payer",
                "isMut": true,
                "isSigner": true
                },
                {
                "name": "systemProgram",
                "isMut": false,
                "isSigner": false
                }
            ],
            "args": [
                {
                "name": "ix",
                "type": {
                    "defined": "UpdatePaymentInfoIx"
                }
                }
            ]
            },
            {
            "name": "closePaymentInfo",
            "accounts": [
                {
                "name": "paymentInfo",
                "isMut": true,
                "isSigner": false
                },
                {
                "name": "authority",
                "isMut": true,
                "isSigner": true
                }
            ],
            "args": []
            }
        ],
        "accounts": [
            {
            "name": "AttributeMul",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "attributeMultiply",
                    "type": {
                    "vec": {
                        "vec": "string"
                    }
                    }
                },
                {
                    "name": "multiplyAmount",
                    "type": {
                    "vec": "u32"
                    }
                },
                {
                    "name": "multiplyProb",
                    "type": {
                    "vec": "u32"
                    }
                },
                {
                    "name": "bump",
                    "type": "u8"
                },
                {
                    "name": "authority",
                    "type": "publicKey"
                }
                ]
            }
            },
            {
            "name": "StakeAuthorizationRecord",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "bump",
                    "type": "u8"
                },
                {
                    "name": "pool",
                    "type": "publicKey"
                },
                {
                    "name": "mint",
                    "type": "publicKey"
                }
                ]
            }
            },
            {
            "name": "CollectionMul",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "collectionsMultiply",
                    "type": {
                    "vec": "publicKey"
                    }
                },
                {
                    "name": "multiplyAmount",
                    "type": {
                    "vec": "u32"
                    }
                },
                {
                    "name": "multiplyProb",
                    "type": {
                    "vec": "u32"
                    }
                },
                {
                    "name": "bump",
                    "type": "u8"
                },
                {
                    "name": "authority",
                    "type": "publicKey"
                }
                ]
            }
            },
            {
            "name": "PaymentInfo",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "bump",
                    "type": "u8"
                },
                {
                    "name": "authority",
                    "type": "publicKey"
                },
                {
                    "name": "identifier",
                    "type": "string"
                },
                {
                    "name": "paymentAmount",
                    "type": "u64"
                },
                {
                    "name": "paymentMint",
                    "type": "publicKey"
                },
                {
                    "name": "paymentShares",
                    "type": {
                    "vec": {
                        "defined": "PaymentShare"
                    }
                    }
                }
                ]
            }
            },
            {
            "name": "RewardEntry",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "bump",
                    "type": "u8"
                },
                {
                    "name": "stakeEntry",
                    "type": "publicKey"
                },
                {
                    "name": "rewardDistributor",
                    "type": "publicKey"
                },
                {
                    "name": "rewardSecondsReceived",
                    "type": "u128"
                },
                {
                    "name": "multiplier",
                    "type": "u64"
                }
                ]
            }
            },
            {
            "name": "RewardDistributor",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "bump",
                    "type": "u8"
                },
                {
                    "name": "stakePool",
                    "type": "publicKey"
                },
                {
                    "name": "kind",
                    "type": "u8"
                },
                {
                    "name": "authority",
                    "type": "publicKey"
                },
                {
                    "name": "identifier",
                    "type": "u64"
                },
                {
                    "name": "rewardMint",
                    "type": "publicKey"
                },
                {
                    "name": "rewardAmount",
                    "type": "u64"
                },
                {
                    "name": "rewardDurationSeconds",
                    "type": "u128"
                },
                {
                    "name": "rewardsIssued",
                    "type": "u128"
                },
                {
                    "name": "defaultMultiplier",
                    "type": "u64"
                },
                {
                    "name": "multiplierDecimals",
                    "type": "u8"
                },
                {
                    "name": "maxRewardSecondsReceived",
                    "type": {
                    "option": "u128"
                    }
                }
                ]
            }
            },
            {
            "name": "UserEscrow",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "bump",
                    "type": "u8"
                },
                {
                    "name": "user",
                    "type": "publicKey"
                }
                ]
            }
            },
            {
            "name": "StakeEntry",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "bump",
                    "type": "u8"
                },
                {
                    "name": "kind",
                    "type": "u8"
                },
                {
                    "name": "pool",
                    "type": "publicKey"
                },
                {
                    "name": "amount",
                    "type": "u64"
                },
                {
                    "name": "stakeMint",
                    "type": "publicKey"
                },
                {
                    "name": "lastStaker",
                    "type": "publicKey"
                },
                {
                    "name": "lastStakedAt",
                    "type": "i64"
                },
                {
                    "name": "lastUpdatedAt",
                    "type": "i64"
                },
                {
                    "name": "totalStakeSeconds",
                    "type": "u128"
                },
                {
                    "name": "usedStakeSeconds",
                    "type": "u128"
                },
                {
                    "name": "cooldownStartSeconds",
                    "type": {
                    "option": "i64"
                    }
                },
                {
                    "name": "multiplierStakeSeconds",
                    "type": {
                    "option": "u128"
                    }
                },
                {
                    "name": "multiplierBasisPoints",
                    "type": {
                    "option": "u64"
                    }
                },
                {
                    "name": "attribute",
                    "type": {
                    "vec": {
                        "vec": "string"
                    }
                    }
                }
                ]
            }
            },
            {
            "name": "StakePool",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "bump",
                    "type": "u8"
                },
                {
                    "name": "authority",
                    "type": "publicKey"
                },
                {
                    "name": "totalStaked",
                    "type": "u32"
                },
                {
                    "name": "resetOnUnstake",
                    "type": "bool"
                },
                {
                    "name": "cooldownSeconds",
                    "type": {
                    "option": "u32"
                    }
                },
                {
                    "name": "minStakeSeconds",
                    "type": {
                    "option": "u32"
                    }
                },
                {
                    "name": "endDate",
                    "type": {
                    "option": "i64"
                    }
                },
                {
                    "name": "stakePaymentInfo",
                    "type": "publicKey"
                },
                {
                    "name": "unstakePaymentInfo",
                    "type": "publicKey"
                },
                {
                    "name": "requiresAuthorization",
                    "type": "bool"
                },
                {
                    "name": "allowedCreators",
                    "type": {
                    "vec": "publicKey"
                    }
                },
                {
                    "name": "allowedCollections",
                    "type": {
                    "vec": "publicKey"
                    }
                },
                {
                    "name": "identifier",
                    "type": "string"
                }
                ]
            }
            }
        ],
        "types": [
            {
            "name": "InitAttributeMulIx",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "attributeMultiply",
                    "type": {
                    "vec": {
                        "vec": "string"
                    }
                    }
                },
                {
                    "name": "multiplyData",
                    "type": {
                    "vec": {
                        "vec": "u32"
                    }
                    }
                },
                {
                    "name": "identifier",
                    "type": "string"
                },
                {
                    "name": "authority",
                    "type": "publicKey"
                }
                ]
            }
            },
            {
            "name": "InitCollectionMulIx",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "collectionsMultiply",
                    "type": {
                    "vec": "publicKey"
                    }
                },
                {
                    "name": "multiplyData",
                    "type": {
                    "vec": {
                        "vec": "u32"
                    }
                    }
                },
                {
                    "name": "identifier",
                    "type": "string"
                },
                {
                    "name": "authority",
                    "type": "publicKey"
                }
                ]
            }
            },
            {
            "name": "UpdateCollectionMulIx",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "collectionsMultiply",
                    "type": {
                    "vec": "publicKey"
                    }
                },
                {
                    "name": "multiplyData",
                    "type": {
                    "vec": {
                        "vec": "u32"
                    }
                    }
                },
                {
                    "name": "identifier",
                    "type": "string"
                },
                {
                    "name": "authority",
                    "type": "publicKey"
                }
                ]
            }
            },
            {
            "name": "InitPaymentInfoIx",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "authority",
                    "type": "publicKey"
                },
                {
                    "name": "identifier",
                    "type": "string"
                },
                {
                    "name": "paymentAmount",
                    "type": "u64"
                },
                {
                    "name": "paymentMint",
                    "type": "publicKey"
                },
                {
                    "name": "paymentShares",
                    "type": {
                    "vec": {
                        "defined": "PaymentShare"
                    }
                    }
                }
                ]
            }
            },
            {
            "name": "PaymentShare",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "address",
                    "type": "publicKey"
                },
                {
                    "name": "basisPoints",
                    "type": "u16"
                }
                ]
            }
            },
            {
            "name": "UpdatePaymentInfoIx",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "authority",
                    "type": "publicKey"
                },
                {
                    "name": "paymentAmount",
                    "type": "u64"
                },
                {
                    "name": "paymentMint",
                    "type": "publicKey"
                },
                {
                    "name": "paymentShares",
                    "type": {
                    "vec": {
                        "defined": "PaymentShare"
                    }
                    }
                }
                ]
            }
            },
            {
            "name": "InitRewardDistributorIx",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "rewardAmount",
                    "type": "u64"
                },
                {
                    "name": "rewardDurationSeconds",
                    "type": "u128"
                },
                {
                    "name": "identifier",
                    "type": "u64"
                },
                {
                    "name": "supply",
                    "type": {
                    "option": "u64"
                    }
                },
                {
                    "name": "defaultMultiplier",
                    "type": {
                    "option": "u64"
                    }
                },
                {
                    "name": "multiplierDecimals",
                    "type": {
                    "option": "u8"
                    }
                },
                {
                    "name": "maxRewardSecondsReceived",
                    "type": {
                    "option": "u128"
                    }
                },
                {
                    "name": "claimRewardsPaymentInfo",
                    "type": "publicKey"
                }
                ]
            }
            },
            {
            "name": "UpdateRewardDistributorIx",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "defaultMultiplier",
                    "type": "u64"
                },
                {
                    "name": "multiplierDecimals",
                    "type": "u8"
                },
                {
                    "name": "rewardAmount",
                    "type": "u64"
                },
                {
                    "name": "rewardDurationSeconds",
                    "type": "u128"
                },
                {
                    "name": "maxRewardSecondsReceived",
                    "type": {
                    "option": "u128"
                    }
                },
                {
                    "name": "claimRewardsPaymentInfo",
                    "type": "publicKey"
                }
                ]
            }
            },
            {
            "name": "UpdateRewardEntryIx",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "multiplier",
                    "type": "u64"
                }
                ]
            }
            },
            {
            "name": "InitEntryIx",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "attribute",
                    "type": {
                    "vec": {
                        "vec": "string"
                    }
                    }
                },
                {
                    "name": "user",
                    "type": "publicKey"
                }
                ]
            }
            },
            {
            "name": "InitPoolIx",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "allowedCollections",
                    "type": {
                    "vec": "publicKey"
                    }
                },
                {
                    "name": "allowedCreators",
                    "type": {
                    "vec": "publicKey"
                    }
                },
                {
                    "name": "requiresAuthorization",
                    "type": "bool"
                },
                {
                    "name": "authority",
                    "type": "publicKey"
                },
                {
                    "name": "resetOnUnstake",
                    "type": "bool"
                },
                {
                    "name": "cooldownSeconds",
                    "type": {
                    "option": "u32"
                    }
                },
                {
                    "name": "minStakeSeconds",
                    "type": {
                    "option": "u32"
                    }
                },
                {
                    "name": "endDate",
                    "type": {
                    "option": "i64"
                    }
                },
                {
                    "name": "stakePaymentInfo",
                    "type": "publicKey"
                },
                {
                    "name": "unstakePaymentInfo",
                    "type": "publicKey"
                },
                {
                    "name": "identifier",
                    "type": "string"
                }
                ]
            }
            },
            {
            "name": "UpdatePoolIx",
            "type": {
                "kind": "struct",
                "fields": [
                {
                    "name": "allowedCollections",
                    "type": {
                    "vec": "publicKey"
                    }
                },
                {
                    "name": "allowedCreators",
                    "type": {
                    "vec": "publicKey"
                    }
                },
                {
                    "name": "requiresAuthorization",
                    "type": "bool"
                },
                {
                    "name": "authority",
                    "type": "publicKey"
                },
                {
                    "name": "resetOnUnstake",
                    "type": "bool"
                },
                {
                    "name": "cooldownSeconds",
                    "type": {
                    "option": "u32"
                    }
                },
                {
                    "name": "minStakeSeconds",
                    "type": {
                    "option": "u32"
                    }
                },
                {
                    "name": "stakePaymentInfo",
                    "type": "publicKey"
                },
                {
                    "name": "unstakePaymentInfo",
                    "type": "publicKey"
                },
                {
                    "name": "endDate",
                    "type": {
                    "option": "i64"
                    }
                }
                ]
            }
            },
            {
            "name": "Action",
            "type": {
                "kind": "enum",
                "variants": [
                {
                    "name": "Stake"
                },
                {
                    "name": "Unstake"
                },
                {
                    "name": "ClaimRewards"
                },
                {
                    "name": "ClaimRewardReceipt"
                },
                {
                    "name": "BoostStakeEntry"
                }
                ]
            }
            }
        ],
        "errors": [
            {
            "code": 6000,
            "name": "InvalidStakePool",
            "msg": "Invalid stake pool"
            },
            {
            "code": 6001,
            "name": "InvalidStakeEntry",
            "msg": "Invalid stake entry"
            },
            {
            "code": 6002,
            "name": "InvalidAuthority",
            "msg": "Invalid stake pool authority"
            },
            {
            "code": 6003,
            "name": "InvalidEscrow",
            "msg": "Mismatched user and escrow"
            },
            {
            "code": 6010,
            "name": "InvalidUserStakeMintTokenAccount",
            "msg": "Invalid user original mint token account"
            },
            {
            "code": 6011,
            "name": "InvalidLastStaker",
            "msg": "Invalid last staker"
            },
            {
            "code": 6012,
            "name": "CannotUpdateUnstakedEntry",
            "msg": "Cannot update unstaked entry"
            },
            {
            "code": 6013,
            "name": "CannotCloseStakedEntry",
            "msg": "Cannot close staked entry"
            },
            {
            "code": 6014,
            "name": "CannotClosePoolWithStakedEntries",
            "msg": "Cannot close staked entry"
            },
            {
            "code": 6020,
            "name": "InvalidMintMetadata",
            "msg": "Invalid mint metadata"
            },
            {
            "code": 6021,
            "name": "MintNotAllowedInPool",
            "msg": "Mint not allowed in this pool"
            },
            {
            "code": 6022,
            "name": "InvalidStakeAuthorizationRecord",
            "msg": "Invalid stake authorization provided"
            },
            {
            "code": 6023,
            "name": "InvalidMintMetadataOwner",
            "msg": "Mint metadata is owned by the incorrect program"
            },
            {
            "code": 6030,
            "name": "InvalidPaymentMint",
            "msg": "Invalid payment mint"
            },
            {
            "code": 6031,
            "name": "InvalidPaymentShares",
            "msg": "Invalid payment shares"
            },
            {
            "code": 6032,
            "name": "InvalidPaymentShare",
            "msg": "Invalid payment share"
            },
            {
            "code": 6033,
            "name": "InvalidPaymentTokenAccount",
            "msg": "Invalid payment token account"
            },
            {
            "code": 6034,
            "name": "InvalidPayerTokenAccount",
            "msg": "Invalid payer token account"
            },
            {
            "code": 6035,
            "name": "InvalidTransferProgram",
            "msg": "Invalid transfer program"
            },
            {
            "code": 6040,
            "name": "CooldownSecondRemaining",
            "msg": "Token still has some cooldown seconds remaining"
            },
            {
            "code": 6050,
            "name": "StakePoolHasEnded",
            "msg": "Stake pool has ended"
            },
            {
            "code": 6051,
            "name": "MinStakeSecondsNotSatisfied",
            "msg": "Minimum stake seconds not satisfied"
            },
            {
            "code": 6060,
            "name": "CannotBoostUnstakedToken",
            "msg": "Cannot boost unstaked token"
            },
            {
            "code": 6061,
            "name": "CannotBoostMoreThanCurrentTime",
            "msg": "Cannot boost past current time less than start time"
            },
            {
            "code": 6062,
            "name": "InvalidBoostPayerTokenAccount",
            "msg": "Invalid boost payer token account"
            },
            {
            "code": 6063,
            "name": "InvalidBoostPaymentRecipientTokenAccount",
            "msg": "Invalid boost payment recipient token account"
            },
            {
            "code": 6064,
            "name": "InvalidPaymentInfo",
            "msg": "Invalid payment info"
            },
            {
            "code": 6065,
            "name": "CannotBoostFungibleToken",
            "msg": "Cannot boost a fungible token stake entry"
            },
            {
            "code": 6070,
            "name": "MaxNumberOfReceiptsExceeded",
            "msg": "Max number of receipts exceeded"
            },
            {
            "code": 6071,
            "name": "InvalidClaimer",
            "msg": "Invalid claimer"
            },
            {
            "code": 6072,
            "name": "RewardSecondsNotSatisfied",
            "msg": "Reward seconds not satisifed"
            },
            {
            "code": 6073,
            "name": "InvalidPayerTokenAcount",
            "msg": "Invalid payer token account"
            },
            {
            "code": 6074,
            "name": "InvalidMaxClaimedReceipts",
            "msg": "Invalid max claimed receipts"
            },
            {
            "code": 6075,
            "name": "InvalidRewardReceipt",
            "msg": "Invalid reward receipt"
            },
            {
            "code": 6076,
            "name": "InvalidReceiptEntry",
            "msg": "Invalid receipt entry"
            },
            {
            "code": 6077,
            "name": "InsufficientAvailableStakeSeconds",
            "msg": "Insufficient available stake seconds to use"
            },
            {
            "code": 6078,
            "name": "InvalidReceiptManager",
            "msg": "Invalid receipt manager"
            },
            {
            "code": 6079,
            "name": "RewardReceiptIsNotAllowed",
            "msg": "Reward receipt is not allowed"
            },
            {
            "code": 6080,
            "name": "RewardReceiptAlreadyClaimed",
            "msg": "Reward receipt already claimed"
            },
            {
            "code": 6090,
            "name": "InvalidTokenAccount",
            "msg": "Invalid token account"
            },
            {
            "code": 6091,
            "name": "InvalidRewardMint",
            "msg": "Invalid reward mint"
            },
            {
            "code": 6092,
            "name": "InvalidUserRewardMintTokenAccount",
            "msg": "Invalid user reward mint token account"
            },
            {
            "code": 6093,
            "name": "InvalidRewardDistributor",
            "msg": "Invalid reward distributor"
            },
            {
            "code": 6094,
            "name": "InvalidRewardDistributorAuthority",
            "msg": "Invalid reward distributor authority"
            },
            {
            "code": 6095,
            "name": "InvalidRewardDistributorKind",
            "msg": "Invalid reward distributor kind"
            },
            {
            "code": 6096,
            "name": "SupplyRequired",
            "msg": "Initial supply required for kind treasury"
            },
            {
            "code": 6097,
            "name": "InvalidPoolDistributor",
            "msg": "Invalid distributor for pool"
            },
            {
            "code": 6098,
            "name": "DistributorNotClosed",
            "msg": "Distributor is already open"
            },
            {
            "code": 6099,
            "name": "DistributorAlreadyClosed",
            "msg": "Distributor is already closed"
            },
            {
            "code": 6100,
            "name": "InvalidRewardEntry",
            "msg": "Invalid reward entry"
            },
            {
            "code": 6101,
            "name": "InvalidRewardDistributorTokenAccount",
            "msg": "Invalid reward distributor token account"
            },
            {
            "code": 6102,
            "name": "InvalidAuthorityTokenAccount",
            "msg": "Invalid authority token account"
            },
            {
            "code": 6103,
            "name": "MaxRewardSecondsClaimed",
            "msg": "Max reward seconds claimed"
            },
            {
            "code": 6104,
            "name": "NotSameMint",
            "msg": "Not the same mint"
            },
            {
            "code": 6105,
            "name": "NotSameProbAmount",
            "msg": "Invalid length of prob and amount"
            },
            {
            "code": 6106,
            "name": "NotSameCollectionData",
            "msg": "Invalid length of collection and data"
            },
            {
            "code": 6107,
            "name": "NotSameAttritubeData",
            "msg": "Invalid length of attribute and data"
            }
        ]
    }

    const programAccounts = await connection.getProgramAccounts(
    REWARDS_CENTER_ADDRESS,
    {
        filters: [
        {
            memcmp: {
            offset: 0,
            bytes: utils.bytes.bs58.encode(
                BorshAccountsCoder.accountDiscriminator('StakePool')
            ),
            },
        },
        // {
        //   memcmp: {
        //     offset: 17,
        //     bytes: user.toBase58(),
        //   },
        // },
        ],
    }
    );

    const stakePoolDatas = [];
    const coder = new BorshAccountsCoder(STAKE_POOL_IDL);

    programAccounts.forEach((account) => {
    try {
        const stakePoolData = coder.decode('StakePool', account.account.data);
        console.log(stakePoolData)
        if (stakePoolData) {
        stakePoolDatas.push({
            ...account,
            parsed: stakePoolData,
        });
        }
    } catch (e) {
        // eslint-disable-next-line no-empty
    }
    });
    console.log(stakePoolDatas)

    //   return stakePoolDatas.sort((a, b) =>
    //     a.pubkey.toBase58().localeCompare(b.pubkey.toBase58())
    //   );
    return stakePoolDatas
}

</script>

<template>
    <div>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitPayment">
            <span>
                init payment
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitPool">
            <span>
                Init Pool
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitCollectionMul">
            <span>
                Init Collection
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitAttributeMul">
            <span>
                Init Attribute
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="UpdateCollectionMul">
            <span>
                Update Collection Mul
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="UpdatePool">
            <span>
               Update pool
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitRewardDistribution">
            <span>
                Init reward distribution
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="Stake">
            <span>
                stake
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="UnStake">
            <span>
                unstake
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="ClosePool">
            <span>
                close pool
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="Check">
            <span>
                check
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="CC">
            <span>
                check metadata
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="FindAllPool">
            <span>
                find all pool
            </span>
        </button>
    </div>
</template>
