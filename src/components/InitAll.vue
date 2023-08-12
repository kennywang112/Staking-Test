<script setup>
import { useWallet } from 'solana-wallets-vue'
import { Transaction,PublicKey,SystemProgram,SYSVAR_INSTRUCTIONS_PUBKEY ,Keypair } from '@solana/web3.js';
import { executeTransaction,fetchIdlAccount,fetchIdlAccountDataById,findMintMetadataId} from "@cardinal/common";
const anchor = require('@project-serum/anchor');
const solana = require('@solana/web3.js');
import { utils,BN } from "@coral-xyz/anchor";
import { NATIVE_MINT } from "@solana/spl-token";//for staking
const wallet = useWallet();

async function init_pool () {
    const REWARDS_CENTER_ADDRESS = new PublicKey("E2PSH444f3ScPpuNChXYLrv7KfcWWNdJvQKwfkaw3wM")
    const stakePoolIdentifier = `TTG`;
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
        utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    const paymentInfoId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("payment-info"),
        utils.bytes.utf8.encode(stakePoolIdentifier),
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    const connection = new anchor.web3.Connection('https://icy-morning-waterfall.solana-mainnet.quiknode.pro/1d4818ff9d1be4c175581c59ddcff56efd9731e6/')
    const provider = new anchor.AnchorProvider(connection, wallet)
    const stakingprogram = new solana.PublicKey('E2PSH444f3ScPpuNChXYLrv7KfcWWNdJvQKwfkaw3wM');
    const idl = await anchor.Program.fetchIdl(stakingprogram, provider);
    const program = new anchor.Program(idl, stakingprogram, provider);
    const tx = new Transaction();
    const ix = await program.methods
    .initPool({
      identifier: stakePoolIdentifier,
      allowedCollections: [new PublicKey("DUfmAvCEPGau1Rf8U62ZFXKogXYLa1BoEgsYSggy1x9f")],
      allowedCreators: [],
      requiresAuthorization: false,
      authority: wallet.publicKey.value,
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
    tx.add(ix);
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);
    const stakePool = await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    //console.log(stakePool[Object.keys(stakePool)[0]])
    console.log(stakePoolId)
}
async function init_payment () {//& update
    const REWARDS_CENTER_ADDRESS = new PublicKey("E2PSH444f3ScPpuNChXYLrv7KfcWWNdJvQKwfkaw3wM")
    const stakePoolIdentifier = `TTG`;
    const paymentInfoId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("payment-info"),
        utils.bytes.utf8.encode(stakePoolIdentifier),
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
        utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    const connection = new solana.Connection('https://icy-morning-waterfall.solana-mainnet.quiknode.pro/1d4818ff9d1be4c175581c59ddcff56efd9731e6/')
    const provider = new anchor.AnchorProvider(connection, wallet)
    const stakingprogram = new solana.PublicKey('E2PSH444f3ScPpuNChXYLrv7KfcWWNdJvQKwfkaw3wM');
    const idl = await anchor.Program.fetchIdl(stakingprogram, provider);
    const program = new anchor.Program(idl, stakingprogram, provider);
    const tx = new Transaction();
    const ix = await program.methods
        .updatePaymentInfo({
            authority: wallet.publicKey.value,
            paymentAmount: new BN(2000000),
            paymentMint: PublicKey.default,
            paymentShares: [
                {
                address: new PublicKey("2JeNLSrJkSaWoFoSQkb1YsxC1dXSaA1LTLjpakzb9SBf"),
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
    //         authority: wallet.publicKey.value,
    //         identifier: stakePoolIdentifier,
    //         paymentAmount: new BN(200000),
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
    //         payer: wallet.publicKey.value ,
    //         systemProgram: SystemProgram.programId})
    //     .instruction();
    tx.add(ix)
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);
    const paymntinfo =await fetchIdlAccountDataById(
        connection,
        [paymentInfoId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    console.log('payment info id :',paymentInfoId.toString())
    console.log('stake pool id :',stakePoolId.toString())
}
async function Authorize_mint () {
    const connection = new anchor.web3.Connection(solana.clusterApiUrl('devnet'),"confirmed")
    const provider = new anchor.AnchorProvider(connection, wallet)
    const stakingprogram = new solana.PublicKey('F3pcjJWRjAAuzRQ5pECcVgV6UAb9U4qy9etA7jWtQB9f');
    const idl = await anchor.Program.fetchIdl(stakingprogram, provider);
    const program = new anchor.Program(idl, stakingprogram, provider);
    const tx = new Transaction();
    const stakePoolIdentifier = `test-3`;
    const mintId = new solana.PublicKey('8vMQNxJXtG4rrqVQufS3yt8rh4ZUMw3Qe6KoyrHDLH7D')
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
        utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        new PublicKey("F3pcjJWRjAAuzRQ5pECcVgV6UAb9U4qy9etA7jWtQB9f") // REWARDS_CENTER_ADDRESS
    )[0];
    const stakeAuthorizationId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("stake-authorization"),
        stakePoolId.toBuffer(),
        mintId.toBuffer(),
        ],
        new PublicKey("F3pcjJWRjAAuzRQ5pECcVgV6UAb9U4qy9etA7jWtQB9f")
    )[0];
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
async function init_entry (){ 
    //const stakePoolIdentifier = `test-${Math.random()}`;
    const stakePoolIdentifier = `test-2`;
    const connection = new anchor.web3.Connection(solana.clusterApiUrl('devnet'))
    const provider = new anchor.AnchorProvider(connection, wallet)
    const stakingprogram = new solana.PublicKey('F3pcjJWRjAAuzRQ5pECcVgV6UAb9U4qy9etA7jWtQB9f');
    const idl = await anchor.Program.fetchIdl(stakingprogram, provider);
    const program = new anchor.Program(idl, stakingprogram, provider);
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
        utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        new PublicKey("F3pcjJWRjAAuzRQ5pECcVgV6UAb9U4qy9etA7jWtQB9f") // REWARDS_CENTER_ADDRESS
    )[0];
    const isFungible = false;
    const stakeEntryId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("stake-entry"),
        stakePoolId.toBuffer(),
        new solana.PublicKey('AD5KtBUppJ6xJijxjFA3CBZZBZFCedjB7Z4ErfGqnF1M').toBuffer(), // 不能在還沒有設定時這樣寫
        wallet.publicKey.value && isFungible ? wallet.publicKey.value.toBuffer() : PublicKey.default.toBuffer(),
        ],
        new PublicKey("F3pcjJWRjAAuzRQ5pECcVgV6UAb9U4qy9etA7jWtQB9f")
    )[0];
    const mintId = new solana.PublicKey('AD5KtBUppJ6xJijxjFA3CBZZBZFCedjB7Z4ErfGqnF1M') // 不能在還沒有設定時這樣寫
    const tx = new Transaction();
    const ix = await program.methods
    .initEntry(wallet.publicKey.value)
    .accountsStrict({
      stakePool: stakePoolId,
      stakeEntry: stakeEntryId,
      stakeMint: new solana.PublicKey('AD5KtBUppJ6xJijxjFA3CBZZBZFCedjB7Z4ErfGqnF1M'),
      stakeMintMetadata: findMintMetadataId(new solana.PublicKey('AD5KtBUppJ6xJijxjFA3CBZZBZFCedjB7Z4ErfGqnF1M')),
      payer: wallet.publicKey.value,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
    tx.add(ix);
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value,{});
    const entry = await fetchIdlAccountDataById(
        connection,
        [stakeEntryId],
        new PublicKey("F3pcjJWRjAAuzRQ5pECcVgV6UAb9U4qy9etA7jWtQB9f"),
        idl
    )
    console.log(tx)
}
async function update_pool () {
    const REWARDS_CENTER_ADDRESS = new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL")
    const stakePoolIdentifier = `whatthefuck`;
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
        utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    const paymentInfoId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("payment-info"),// STAKE_POOL_PREFIX.as_bytes()
        utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    const connection = new anchor.web3.Connection(solana.clusterApiUrl('devnet'),"confirmed")
    const provider = new anchor.AnchorProvider(connection, wallet)
    const stakingprogram = new solana.PublicKey('kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL');
    const idl = await anchor.Program.fetchIdl(stakingprogram, provider);
    const program = new anchor.Program(idl, stakingprogram, provider);
    const tx = new Transaction();
    tx.add( 
        await program.methods
        .updatePool({
            allowedCollections: [new PublicKey("7SJiu2jPMKddCHDBKkwR7rQrKum33GGyvoCdjEgwFVsR"),new PublicKey('2FsWDbGFDhkJZBiKV3Y18CRP4dhJegAwstBG8Yagbi24')],
            allowedCreators: [],
            requiresAuthorization: true,
            authority: wallet.publicKey.value,
            resetOnUnstake: false,
            cooldownSeconds: null,
            minStakeSeconds: null,
            endDate: null,
            stakePaymentInfo: new PublicKey('4tYqd57iLsCx7Dhi8WDRmuJhF41Gny3vuB1KzUt4BC87'),//programs/cardinal-rewards-center/src/payment/state.rs有限制
            unstakePaymentInfo: new PublicKey('4tYqd57iLsCx7Dhi8WDRmuJhF41Gny3vuB1KzUt4BC87'),
        })
        .accounts({
            stakePool: stakePoolId,
            payer: wallet.publicKey.value,
            authority: wallet.publicKey.value,
            systemProgram: SystemProgram.programId
        }).instruction());
    console.log(paymentInfoId)
    const exec = await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);
}
async function init_reward_distribution () { // & update
    const rewardmintId = new solana.PublicKey('2tiniRaY93hU9tEpoAe4xy9hHLy1FpLt4zEjHhe1K3r4')
    const REWARDS_CENTER_ADDRESS = new PublicKey("E2PSH444f3ScPpuNChXYLrv7KfcWWNdJvQKwfkaw3wM")
    const stakePoolIdentifier = `TTG`;
    const paymentInfoId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("payment-info"),
        utils.bytes.utf8.encode(stakePoolIdentifier),
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    const stakePoolId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
        utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
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
    console.log(rewardDistributorId)
    const connection = new anchor.web3.Connection('https://icy-morning-waterfall.solana-mainnet.quiknode.pro/1d4818ff9d1be4c175581c59ddcff56efd9731e6/')
    const provider = new anchor.AnchorProvider(connection, wallet)
    const stakingprogram = new solana.PublicKey('E2PSH444f3ScPpuNChXYLrv7KfcWWNdJvQKwfkaw3wM');
    const idl = await anchor.Program.fetchIdl(stakingprogram, provider);
    const program = new anchor.Program(idl, stakingprogram, provider);
    const distributor =await fetchIdlAccountDataById(
        connection,
        [rewardDistributorId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    const stakePool =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
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
      authority: provider.wallet.publicKey.value,
      payer: provider.wallet.publicKey.value,
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
    await executeTransaction(provider.connection, tx, provider.wallet.wallet.value);
//     const reward =await fetchIdlAccountDataById(
//         connection,
//         [rewardDistributorId],
//         REWARDS_CENTER_ADDRESS,
//         idl
//     )
    console.log('finish')
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
</div>
</template>
