<script setup>
import { useWallet } from 'solana-wallets-vue'
import { 
    Transaction, 
    PublicKey,
    SystemProgram,
    clusterApiUrl,
} from '@solana/web3.js';
import { 
    executeTransaction,
    executeTransactions,
    fetchIdlAccountDataById,
    chunkArray
 } from "@cardinal/common";
const anchor = require('@project-serum/anchor');
import { utils, BorshAccountsCoder } from "@coral-xyz/anchor";
import { claimRewards } from "../useStakingOrigin"

const wallet = useWallet();
wallet.publicKey = wallet.publicKey.value ?? wallet.publicKey;
wallet.signAllTransactions = wallet.signAllTransactions.value ?? wallet.signAllTransactions

// let stakePoolIdentifier = `adcs`;//this is for the client
const stakePoolIdentifier = `amcdew`;
const REWARDS_CENTER_ADDRESS = new PublicKey("5n4FXHbJHum7cW9w1bzYY8gdvgyC92Zk7yD2Qi9mW13g")
const mintId = new PublicKey('8cSVigyxGxc5EzUdpWDoEvhVtXKrucYHg6k8cPrHciai')

const connection = new anchor.web3.Connection(clusterApiUrl('devnet'))
const provider = new anchor.AnchorProvider(connection, wallet)
let idl = anchor.Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);

const keyBuffer = Buffer.from('kennypoolss', 'utf-8')
const prefixBuffer = Buffer.from('s', 'utf-8')

const stakePoolId = PublicKey.findProgramAddressSync(
    [
        utils.bytes.utf8.encode('stake-pool'),
        utils.bytes.utf8.encode(stakePoolIdentifier),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
const rewardDistributorId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode("reward-distributor"),
    stakePoolId.toBuffer(),
    new anchor.BN(0).toArrayLike(Buffer, "le", 8)
    ],
    REWARDS_CENTER_ADDRESS
)[0];
const configEntryId = PublicKey.findProgramAddressSync(
    [
        utils.bytes.utf8.encode("config-entry"),
        prefixBuffer,
        keyBuffer
    ],
    REWARDS_CENTER_ADDRESS
)[0];
const stakeEntryId = PublicKey.findProgramAddressSync(
    [
        utils.bytes.utf8.encode("stake-entry"),
        stakePoolId.toBuffer(),
        mintId.toBuffer(),
        PublicKey.default.toBuffer()
    ],
    REWARDS_CENTER_ADDRESS
)[0]
const config = {
  name: 'wow',
  displayName: 'play',
  nameInHeader: 'abc',
  stakePoolAddress: stakePoolId,
  description: 'this is description',
  imageUrl: 'https://hackmd.io/X1__vFfsQQaDMIjJL8Vh_g',
  websiteUrl: 'https://hackmd.io/X1__vFfsQQaDMIjJL8Vh_g',
}

async function InitConfig() {

    idl = await idl;
    const CONFIG_VALUE_LIMIT = 790
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);

    const stakePool =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )

    const { stakePoolAddress: _, ...otherObject } = config
    const configString = JSON.stringify({
        stakePoolAddress: stakePoolId.toString(),
        ...otherObject,
      })
    const configChunks = chunkArray(
        configString.split(''),
        CONFIG_VALUE_LIMIT
    ).map((chunk) => chunk.join(''))

    const txs = []
    const tx = new Transaction();
    const initIx = await program.methods
        .initConfigEntry({
            prefix: prefixBuffer,
            key: keyBuffer,
            value: configChunks[0],
            extends: [],
        })
        .accountsStrict({
            configEntry: configEntryId,
            authority: wallet.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
        {
            pubkey: stakePoolId,
            isSigner: false,
            isWritable: false,
        },
        ])
        .instruction()
    tx.add(initIx)
    txs.push(tx)

    console.log(txs)
    await executeTransactions(provider.connection, txs, provider.wallet.wallet.value);
    
}
async function CheckConfig() {

    idl = await idl;
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
    console.log(configDatas)
    
    const configdata = await fetchIdlAccountDataById(
        connection,
        [configEntryId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
    const config_value = JSON.parse(configdata[Object.keys(configdata)[0]].parsed.value)
    console.log(config_value["imageUrl"])
}
async function CheckPool() {

    idl = await idl;
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);

    const pooldata =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )

    const stakeEntries = await program.account.stakeEntry.all([
          {
            memcmp: {
              offset: 10,
              bytes: stakePoolId.toString(),
            },
          },
        ])
    const filtered_entries = stakeEntries.filter(
        (entry) =>
            entry.account.lastStaker.toString() !==
            PublicKey.default.toString()
        )
        .map((e) => {
        return { pubkey: e.publicKey, parsed: e.account }
    })
    
    const download = await downloadSnapshot(filtered_entries)
    console.log(download)
}
async function ClaimFund() {

    const LOOKUP_BATCH_SIZE =  5000;

    idl = await idl;
    const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
    let txs = [];

    const stakeEntries = await program.account.stakeEntry.all([
          {
            memcmp: {
              offset: 10,
              bytes: stakePoolId.toString(),
            },
          },
        ])
    const filtered_entries = stakeEntries.filter(
        (entry) =>
            entry.account.lastStaker.toString() !==
            PublicKey.default.toString()
        )
        .map((e) => {
        return { pubkey: e.publicKey, parsed: e.account }
    })

    const batchStakeEntries = chunkArray(filtered_entries, LOOKUP_BATCH_SIZE)
    for (const entries of batchStakeEntries) {
        const batchTxs = await claimRewards(
        connection,
        wallet,
        stakePoolIdentifier,
        entries.map((entry) => {
            return {
            mintId: entry.parsed.stakeMint,
            }
        }),
        [rewardDistributorId],
        true
        )
        txs = [...txs, ...batchTxs]
    }
    const batchSize = 4;
    const batchedTxs = chunkArray(txs, batchSize)
    const final_batchedTxs = batchedTxs.map((txs) => {
        const transaction = new Transaction()
        transaction.instructions = txs.map((tx) => tx.instructions).flat()
        return transaction
    })
    
    console.log(final_batchedTxs[0])
    await executeTransaction(provider.connection, final_batchedTxs[0], provider.wallet.wallet.value);
}

async function downloadSnapshot(data) {
    let body = `Total Staked Tokens,${
      data.length
    }\nSnapshot Timestamp,${Math.floor(
      Date.now() / 1000
    )}\n\nMint Address,Staker Address,Total Stake Seconds,Last Staked At,\n`
    data.forEach((data) => {
      body += `${data.parsed.stakeMint.toString()},${data.parsed.lastStaker.toString()},${data.parsed.totalStakeSeconds.toString()},${data.parsed.lastStakedAt.toString()}\n`
    })
    const element = document.createElement('a')
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(body)
    )
    element.setAttribute('download', 'snapshot.csv')

    element.style.display = 'none'
    document.body.appendChild(element)

    element.click()

    document.body.removeChild(element)
}

</script>

<template>
    <div>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="InitConfig">
            <span>
                init config
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="CheckConfig">
            <span>
                check config
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="CheckPool">
            <span>
                check pool
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="ClaimFund">
            <span>
                claim fund
            </span>
        </button>
    </div>
</template>
