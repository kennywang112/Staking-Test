<script setup>
import { useWallet } from 'solana-wallets-vue'
import { Transaction, PublicKey,SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY, Keypair, clusterApiUrl } from '@solana/web3.js';
import { executeTransaction, executeTransactions, fetchIdlAccount, fetchIdlAccountDataById, findMintMetadataId} from "@cardinal/common";
const anchor = require('@project-serum/anchor');
const solana = require('@solana/web3.js');
import { utils,BN } from "@coral-xyz/anchor";
import { NATIVE_MINT } from "@solana/spl-token";//for staking
import { stake, unstake, claimRewards } from "../useStaking"

const wallet = useWallet();

let stakePoolIdentifier = `1`;
let REWARDS_CENTER_ADDRESS = new PublicKey("7qvLBUh8LeRZrd35Df1uoV5pKt4oxgmJosKZr3yRYsXQ")

let mintId = new solana.PublicKey('HQibTvbQqhquaDewaYxWm72Kb9tpWdp7vojky8oNDmt')
let rewardmintId = new solana.PublicKey('D8J6gcTSLPwXS9h4afZvDEQr2qGxscVfUPnrfbHQxhzJ')

let connection = new anchor.web3.Connection(clusterApiUrl('devnet'))
let provider = new anchor.AnchorProvider(connection, wallet)
let idl = anchor.Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);
//let program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);

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
    utils.bytes.utf8.encode(stakePoolIdentifier),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
let stakeAuthorizationId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode("stake-authorization"),
    stakePoolId.toBuffer(),
    mintId.toBuffer(),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
let rewardDistributorId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode("reward-distributor"),
    stakePoolId.toBuffer(),
    //(identifier ?? new BN(0)).toArrayLike(Buffer, "le", 8),
    new BN(0).toArrayLike(Buffer, "le", 8)
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

    const program = new anchor.Program(await idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();

    const ix = await program.methods
    .initPool({
      identifier: stakePoolIdentifier,
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
        owner: new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"),
        stakePool: stakePoolId,
        payer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
    })
    .instruction();

    tx.add(ix);

    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);

    console.log(tx)
}
async function init_payment () {//& update

    const program = new anchor.Program(await idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();

    // const ix = await program.methods
    //     .updatePaymentInfo({
    //         authority: wallet.publicKey.value,
    //         paymentAmount: new BN(2000000),
    //         paymentMint: PublicKey.default,
    //         paymentShares: [
    //             {
    //             address: new PublicKey("2JeNLSrJkSaWoFoSQkb1YsxC1dXSaA1LTLjpakzb9SBf"),
    //             basisPoints: 10000,
    //             },
    //         ],
    //     })
    //     .accounts({ 
    //         paymentInfo: paymentInfoId, 
    //         authority : wallet.publicKey.value,
    //         payer: wallet.publicKey.value ,
    //         systemProgram: SystemProgram.programId})
    //     .instruction();

    const ix = await program.methods
        .initPaymentInfo({
            authority: wallet.publicKey,
            identifier: stakePoolIdentifier,
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
            payer: wallet.publicKey,
            systemProgram: SystemProgram.programId})
        .instruction();

    tx.add(ix)
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);

    let stakePool =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    console.log(tx)
    
    console.log('payment info id :',paymentInfoId.toString())
    console.log('stake pool id :',stakePoolId.toString())
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
        new PublicKey("F3pcjJWRjAAuzRQ5pECcVgV6UAb9U4qy9etA7jWtQB9f"),
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
            requiresAuthorization: true,
            authority: new PublicKey("F4rMWNogrJ7bsknYCKEkDiRbTS9voM7gKU2rcTDwzuwf"),
            resetOnUnstake: false,
            cooldownSeconds: null,
            minStakeSeconds: null,
            endDate: null,
            // stakePaymentInfo: paymentInfoId,
            // unstakePaymentInfo: paymentInfoId,
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
    const ix = await program.methods
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
      authority: wallet.publicKey,
      payer: wallet.publicKey,
    })
    .instruction();

//     const ix = await program.methods
//     .updateRewardDistributor({
//       rewardAmount: new BN(1000),//
//       rewardDurationSeconds: new BN(1),//
//       defaultMultiplier: new BN(1),//
//       multiplierDecimals: 0,//
//       maxRewardSecondsReceived: null,
//       claimRewardsPaymentInfo: new PublicKey("4tYqd57iLsCx7Dhi8WDRmuJhF41Gny3vuB1KzUt4BC87"),//
//     })
//     .accounts({
//       rewardDistributor: rewardDistributorId,
//       authority: provider.wallet.publicKey.value,
//     })
//     .instruction();

    tx.add(ix);

    console.log(tx)
    await executeTransaction(connection, tx, provider.wallet.wallet.value);

    console.log('finish')
}
async function UnStake () {

    const tx = await unstake(connection, wallet, stakePoolIdentifier, [{mintId: mintId}],[rewardDistributorId])

    await executeTransactions(connection, tx, wallet);

    console.log(tx)
}



</script>

<template>
    <div>
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
            @click="UnStake">
            <span>
                unstake
            </span>
        </button>
</div>
</template>
