<script setup>
import { useWallet } from 'solana-wallets-vue'
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
    sendAndConfirmTransaction
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createTransferInstruction, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { executeTransaction, fetchIdlAccountDataById, withFindOrInitAssociatedTokenAccount, executeTransactions } from "@cardinal/common";
const anchor = require('@project-serum/anchor');
import { utils,BN } from "@coral-xyz/anchor";
import { stakeOld, unstakeOld } from "../oldStaking"
import { publicKey } from '@coral-xyz/anchor/dist/cjs/utils';
import { editionBeet } from '@metaplex-foundation/mpl-token-metadata';
const wallet = useWallet();

const stakePoolIdentifier = `TTT`;
const paymentIdentifier = `TTG`
const REWARDS_CENTER_ADDRESS = new PublicKey("E2PSH444f3ScPpuNChXYLrv7KfcWWNdJvQKwfkaw3wM");

const rewardmintId = new PublicKey("2tiniRaY93hU9tEpoAe4xy9hHLy1FpLt4zEjHhe1K3r4")
const allowed_collection = new PublicKey('4A2em16CXt4gCSnUzJE8oVBSkNadW15rpG5oxwjhJBnc')

const connection = new anchor.web3.Connection("https://icy-morning-waterfall.solana-mainnet.quiknode.pro/1d4818ff9d1be4c175581c59ddcff56efd9731e6/")
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
    utils.bytes.utf8.encode(paymentIdentifier),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
const rewardDistributorId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode("reward-distributor"),
    stakePoolId.toBuffer(),
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
    
    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);

    const tx = new Transaction();

    const init_ix = await program.methods
        .initPool({
            identifier: stakePoolIdentifier,
            allowedCollections: [allowed_collection],
            allowedCreators: [],
            requiresAuthorization: false,
            authority: new PublicKey("2JeNLSrJkSaWoFoSQkb1YsxC1dXSaA1LTLjpakzb9SBf"),
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
            systemProgram: SystemProgram.programId,
        })
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
            rewardAmount: new BN(210),
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

    tx.add(init_ix);
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
            11760000*(10**6)
        )
    );

    await executeTransaction(connection, tx, provider.wallet.wallet.value);
}
async function Check() {

    idl = await idl

    const reward = await fetchIdlAccountDataById(
        connection,
        [rewardDistributorId],
        REWARDS_CENTER_ADDRESS,
        idl
    )

    console.log(reward[Object.keys(reward)[0]])

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
            @click="Check">
            <span>
                Check
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
