<script setup>
import { useWallet } from 'solana-wallets-vue'
import { Transaction, PublicKey, SystemProgram, clusterApiUrl } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createTransferInstruction, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { executeTransaction, fetchIdlAccountDataById, withFindOrInitAssociatedTokenAccount, executeTransactions } from "@cardinal/common";
const anchor = require('@project-serum/anchor');
import { utils,BN } from "@coral-xyz/anchor";
import { stakeOld, unstakeOld } from "../oldStaking"
const wallet = useWallet();

const stakePoolIdentifier = `6`;
const REWARDS_CENTER_ADDRESS = new PublicKey("An63Hmi2dsQxybVhxRvoXHKRM1qeruYF3J9cEmrBSjsM")

const mintId = new PublicKey("6sYKYoMqdvDSe8iMxn7FKguKYfw7R1ETg6XEWF3vs357")
const masterId = new PublicKey("36fLo1rHBQ1ZgAnsrBZN5Po22MLVQu4EeFjiozhPzvSv")
const rewardmintId = new PublicKey("D8J6gcTSLPwXS9h4afZvDEQr2qGxscVfUPnrfbHQxhzJ")

const connection = new anchor.web3.Connection(clusterApiUrl('devnet'))
const provider = new anchor.AnchorProvider(connection, wallet)
let idl = anchor.Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);
//let program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);

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
    utils.bytes.utf8.encode("2"),
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
    const payer_mint_token_account = getOrCreateAssociatedTokenAccount(connection, wallet.publicKey, usdc_mint, wallet.publicKey)
    const owner_mint_token_account = getOrCreateAssociatedTokenAccount(connection, wallet.publicKey, usdc_mint, new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"))

    const tx = new Transaction();
    const ix = await program.methods
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
        usdcMint: usdc_mint,
        payerMintTokenAccount: (await payer_mint_token_account).address,
        ownerMintTokenAccount: (await owner_mint_token_account).address,
        // owner: new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"),
        payer: wallet.publicKey.value,
        systemProgram: SystemProgram.programId,
    })
    .instruction();
    // const ix = await program.methods
    //     .updatePool({
    //         allowedCollections: [],
    //         allowedCreators: [new PublicKey("38xYvEUfiEH6hKqtJ4xVCkGg18nsDDTSi8pkW5GbM628")],
    //         requiresAuthorization: false,
    //         authority: new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"),
    //         resetOnUnstake: false,
    //         cooldownSeconds: null,
    //         minStakeSeconds: null,
    //         endDate: null,
    //         stakePaymentInfo: paymentInfoId,
    //         unstakePaymentInfo: paymentInfoId,
    //     })
    //     .accounts({
    //         stakePool: stakePoolId,
    //         payer: wallet.publicKey.value,
    //         authority: wallet.publicKey.value,
    //         systemProgram: SystemProgram.programId
    //     }).instruction()

    tx.add(ix);

    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);
    const stakePool =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    console.log(stakePool)
}
async function init_payment () {//& update

    const program = new anchor.Program(await idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();

    const ix = await program.methods
        .updatePaymentInfo({
            authority: wallet.publicKey.value,
            paymentAmount: new BN(2000000),
            paymentMint: PublicKey.default,
            paymentShares: [
                {
                address: new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"),
                basisPoints: 10000,
                },
            ],
        })
        .accounts({ 
            paymentInfo: paymentInfoId, 
            authority : wallet.publicKey.value,
            payer: wallet.publicKey.value ,
            systemProgram: SystemProgram.programId})
        .instruction();

    // const ix = await program.methods
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
    //         payer: wallet.publicKey ,
    //         systemProgram: SystemProgram.programId})
    //     .instruction();
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
      authority: wallet.publicKey.value,
      payer: wallet.publicKey.value,
    })
    .instruction();

    // const ix = await program.methods
    // .updateRewardDistributor({
    //   rewardAmount: new BN(1000),//
    //   rewardDurationSeconds: new BN(1),//
    //   defaultMultiplier: new BN(1),//
    //   multiplierDecimals: 0,//
    //   maxRewardSecondsReceived: null,
    //   claimRewardsPaymentInfo: new PublicKey("4tYqd57iLsCx7Dhi8WDRmuJhF41Gny3vuB1KzUt4BC87"),//
    // })
    // .accounts({
    //   rewardDistributor: rewardDistributorId,
    //   authority: provider.wallet.publicKey.value,
    // })
    // .instruction();

    tx.add(ix);
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
        10000000000
        )
    );

    await executeTransaction(connection, tx, provider.wallet.wallet.value);
}

async function staking () {

    const tx = await stakeOld(connection, wallet, stakePoolIdentifier, [{mintId: masterId}])

    await executeTransactions(connection, tx, provider.wallet.wallet.value);
}
async function unstaking () {

    const tx = await unstakeOld(connection, wallet, stakePoolIdentifier, [{mintId: masterId}],[rewardDistributorId])

    await executeTransactions(connection, tx, provider.wallet.wallet.value)
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
</div>
</template>
