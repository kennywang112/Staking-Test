<script setup>
import { useWallet } from 'solana-wallets-vue'
import { 
    Transaction, 
    PublicKey,
    SystemProgram, 
    SYSVAR_INSTRUCTIONS_PUBKEY,
    Keypair, 
    clusterApiUrl 
} from '@solana/web3.js';
import { 
    executeTransaction,
    executeTransactions, 
    withFindOrInitAssociatedTokenAccount, 
    fetchIdlAccountDataById,
    fetchIdlAccount
 } from "@cardinal/common";
const anchor = require('@project-serum/anchor');
const solana = require('@solana/web3.js');
import { utils,BN } from "@coral-xyz/anchor";
import { NATIVE_MINT, getAssociatedTokenAddressSync, createTransferInstruction, getAccount } from "@solana/spl-token";
import { stake, unstake, claimRewards } from "../useStaking"
const wallet = useWallet();

let hacoIdentifier = `TTG`;//this is for the owner
let stakePoolIdentifier = `clt`;//this is for the client
let REWARDS_CENTER_ADDRESS = new PublicKey("AqvDdGTBFCu2fQxL5GHUdW73wzLh2sEcayvVSPhujDSH")//version2

let mintId = new solana.PublicKey('Bc81yy5N2TBTKTkEPp6SniBqqDd3u6JiJqXiRMpgLQww')
let rewardmintId = new solana.PublicKey('D8J6gcTSLPwXS9h4afZvDEQr2qGxscVfUPnrfbHQxhzJ')

let connection = new anchor.web3.Connection(clusterApiUrl('devnet'))
let provider = new anchor.AnchorProvider(connection, wallet)
let idl = anchor.Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);

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

async function InitPool () {

    const program = new anchor.Program(await idl, REWARDS_CENTER_ADDRESS, provider);
    
    const tx = new Transaction();
    const ix = await program.methods
    .initPool({
      identifier: stakePoolIdentifier,
      allowedCollections: [],
      allowedCreators: [],
      requiresAuthorization: false,
      authority: new PublicKey('F4rMWNogrJ7bsknYCKEkDiRbTS9voM7gKU2rcTDwzuwf'),
      resetOnUnstake: false,
      cooldownSeconds: null,
      minStakeSeconds: null,
      endDate: null,
    })
    .accounts({
      stakePool: stakePoolId,
      payer: wallet.publicKey.value,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

    tx.add(ix);

    console.log(tx)
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);

    console.log('success')
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
    //await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);

    console.log('payment info id :',paymentInfoId.toString())
    console.log('stake pool id :',stakePoolId.toString())
}

async function InitRewardDistribution () {

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
    })
    .accounts({
      rewardDistributor: rewardDistributorId,
      stakePool: stakePoolId,
      rewardMint: rewardmintId,
      authority: wallet.publicKey,
      payer: wallet.publicKey,
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

async function UpdatePool () {

    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
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

    const tx = await stake(connection, wallet, stakePoolIdentifier, [{mintId: mintId}])

    await executeTransactions(connection, tx, wallet);

    console.log(tx)

}

async function UnStake () {

    const tx = await unstake(connection, wallet, stakePoolIdentifier, [{mintId: mintId}],[rewardDistributorId])

    await executeTransactions(connection, tx, wallet);

    //console.log(tx)

    const REWARDS_CENTER_ADDRESS = new PublicKey("AqvDdGTBFCu2fQxL5GHUdW73wzLh2sEcayvVSPhujDSH")
    const provider = new anchor.AnchorProvider(connection, wallet)
    const idl = await anchor.Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);
    const stakePaymentInfoData = await fetchIdlAccount(
        connection,
        new PublicKey('5vsKac5CuyHnK1A19Vs4ChvBV4PreHKKvgmACA6KyGdi'),
        "PaymentInfo",
        idl
    );
    console.log(stakePaymentInfoData)
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
    </div>
</template>
