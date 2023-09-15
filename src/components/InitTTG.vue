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
import { utils,BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, createTransferInstruction, getAccount, getMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { stake, unstake, stakeauth } from "../useStakingOrigin"
const wallet = useWallet();

let hacoIdentifier = `TTGG`;//this is for the owner
let stakePoolIdentifier = `ad`;//this is for the client
let REWARDS_CENTER_ADDRESS = new PublicKey("648a7xE2sSERhxeXWKtnptDA1cJT2dUAgq9sJ558en9q")

let mintId = new PublicKey('33HCu267WEyQG3oi1iMNsgoHoBGT2XhzeptNkPgQH14U')
let rewardmintId = new PublicKey('D8J6gcTSLPwXS9h4afZvDEQr2qGxscVfUPnrfbHQxhzJ')

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
        requiresAuthorization: true,
        authority: new PublicKey('F4rMWNogrJ7bsknYCKEkDiRbTS9voM7gKU2rcTDwzuwf'),
        resetOnUnstake: false,
        cooldownSeconds: null,
        minStakeSeconds: null,
        endDate: null,
        stakePaymentInfo: SOL_PAYMENT_INFO,
        unstakePaymentInfo: SOL_PAYMENT_INFO,
    })
    .accounts({
        owner: new PublicKey("Se9gzT3Ep3E452LPyYaWKYqcCvsAwtHhRQwQvmoXFxG"),// sol destination
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

async function UpdatePool () {

    const program = new anchor.Program(await idl, REWARDS_CENTER_ADDRESS, provider);
    const tx = new Transaction();

    tx.add( 
        await program.methods
        .updatePool({
            allowedCollections: [],
            allowedCreators: [],
            requiresAuthorization: false,
            authority: new PublicKey('7Tf8wc7PczAJbYgeT4J9bvNh1yNZU8JGA7tEDkejaeTb'),
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

    const tx = await stake(connection, wallet, stakePoolIdentifier, [{mintId: mintId}])
    await executeTransactions(connection, tx, provider.wallet.wallet.value);

    console.log(tx)
}
async function UnStake () {

    const tx = await unstake(connection, wallet, stakePoolIdentifier, [{mintId: mintId}],[rewardDistributorId])

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
        authority: wallet.publicKey
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

async function Authorize () {

    const authorizationId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode(`stake-authorization`),
        stakePoolId.toBuffer(),
        mintId.toBuffer(),
        ],
        REWARDS_CENTER_ADDRESS
    )[0];

    idl = await idl
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);

    const tx = new Transaction();
    tx.add(
    await program.methods
        .authorizeMint(mintId)
        .accounts({
        stakePool: stakePoolId,
        stakeAuthorizationRecord: authorizationId,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        })
        .instruction()
    )

    // await executeTransactions(connection, [tx], provider.wallet.wallet.value);
    const authorization = await fetchIdlAccountDataById(
        connection,
        [authorizationId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    console.log(authorization)
}
async function StakeWithAuth () {

    const tx = await stakeauth(connection, wallet, stakePoolIdentifier, [{mintId: mintId}])
    await executeTransactions(connection, tx, provider.wallet.wallet.value);

    console.log(tx)
}
</script>

<template>
    <div>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitPool">
            <span>
                init pool
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitPayment">
            <span>
                init payment
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
            @click="Authorize">
            <span>
                Authorize
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="StakeWithAuth">
            <span>
                Stake auth
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
    </div>
</template>
