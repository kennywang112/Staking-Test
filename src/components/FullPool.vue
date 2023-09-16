<script setup>
import { useWallet } from 'solana-wallets-vue'
import { 
    Transaction, 
    PublicKey,
    SystemProgram,
    clusterApiUrl,
    sendAndConfirmTransaction
} from '@solana/web3.js';
import { 
    executeTransaction,
    executeTransactions,
    fetchIdlAccountDataById,
 } from "@cardinal/common";
const anchor = require('@project-serum/anchor');
import { utils, BorshAccountsCoder } from "@coral-xyz/anchor";
// import { configsProgram } from '@cardinal/configs/dist/cjs/programs/constants'
// import { findConfigEntryId } from '@cardinal/configs/dist/cjs/programs/pda'
import { chunkArray, tryNull } from '@cardinal/common'

const wallet = useWallet();
wallet.publicKey = wallet.publicKey.value ?? wallet.publicKey;
wallet.signAllTransactions = wallet.signAllTransactions.value ?? wallet.signAllTransactions

let stakePoolIdentifier = `fdivefivae`;//this is for the client
let REWARDS_CENTER_ADDRESS = new PublicKey("7qvLBUh8LeRZrd35Df1uoV5pKt4oxgmJosKZr3yRYsXQ")

let connection = new anchor.web3.Connection(clusterApiUrl('devnet'))
let provider = new anchor.AnchorProvider(connection, wallet)
let idl = anchor.Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);

let keyBuffer = Buffer.from('kennypool', 'utf-8')
let prefixBuffer = Buffer.from('s', 'utf-8')

let stakePoolId = PublicKey.findProgramAddressSync(
    [
        utils.bytes.utf8.encode('stake-pool'),
        utils.bytes.utf8.encode(stakePoolIdentifier),
    ],
    REWARDS_CENTER_ADDRESS
)[0];
let configEntryId = PublicKey.findProgramAddressSync(
    [utils.bytes.utf8.encode("config-entry"), prefixBuffer, keyBuffer],
    new PublicKey("cnf9Q2MmjDVbzX1kjr8tEEtPJyB4e1avEuBMzWygnWo")
)[0];
const config = {
  name: 'wow',
  displayName: 'play',
  nameInHeader: 'abc',
  stakePoolAddress: stakePoolId,
  description: 'this is description',
  imageUrl: 'https://hackmd.io/X1__vFfsQQaDMIjJL8Vh_g',
  websiteUrl: 'https://hackmd.io/X1__vFfsQQaDMIjJL8Vh_g',
}

const IDL = {
    "version": "1.0.0",
    "name": "cardinal_configs",
    "instructions": [
    {
        "name": "initConfigEntry",
        "accounts": [
        {
            "name": "configEntry",
            "isMut": true,
            "isSigner": false,
        },
        {
            "name": "authority",
            "isMut": true,
            "isSigner": true,
        },
        {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false,
        },
        ],
        "args": [
        {
            "name": "ix",
            "type": {
            "defined": "InitConfigEntryIx",
            },
        },
        ],
    },
    {
        "name": "updateConfigEntry",
        "accounts": [
        {
            "name": "configEntry",
            "isMut": true,
            "isSigner": false,
        },
        {
            "name": "authority",
            "isMut": true,
            "isSigner": true,
        },
        {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false,
        },
        ],
        "args": [
        {
            "name": "ix",
            "type": {
            "defined": "UpdateConfigEntryIx",
            },
        },
        ],
    },
    ],
    "accounts": [
    {
        "name": "configEntry",
        "type": {
        "kind": "struct",
        "fields": [
            {
            "name": "bump",
            "type": "u8",
            },
            {
            "name": "prefix",
            "type": "bytes",
            },
            {
            "name": "key",
            "type": "bytes",
            },
            {
            "name": "value",
            "type": "string",
            },
            {
            "name": "extends",
            "type": {
                "vec": "publicKey",
            },
            },
        ],
        },
    },
    ],
    "types": [
    {
        "name": "InitConfigEntryIx",
        "type": {
        "kind": "struct",
        "fields": [
            {
            "name": "prefix",
            "type": "bytes",
            },
            {
            "name": "key",
            "type": "bytes",
            },
            {
            "name": "value",
            "type": "string",
            },
            {
            "name": "extends",
            "type": {
                "vec": "publicKey",
            },
            },
        ],
        },
    },
    {
        "name": "UpdateConfigEntryIx",
        "type": {
        "kind": "struct",
        "fields": [
            {
            "name": "value",
            "type": "string",
            },
            {
            "name": "extends",
            "type": {
                "vec": "publicKey",
            },
            },
            {
            "name": "append",
            "type": "bool",
            },
        ],
        },
    },
    ],
    "errors": [
    {
        "code": 6000,
        "name": "InvalidAuthority",
        "msg": "Invalid authority",
    },
    {
        "code": 6001,
        "name": "MissingRemainingAccountsForConfigEntry",
        "msg": "Missing remaining accounts for config entry",
    },
    {
        "code": 6002,
        "name": "InvalidStakePoolAccount",
        "msg": "Invalid stake pool account",
    },
    {
        "code": 6003,
        "name": "InvalidRewardCenterPoolAccount",
        "msg": "Invalid reward center pool account",
    },
    {
        "code": 6004,
        "name": "InvalidPoolAuthority",
        "msg": "Invalid pool authority",
    },
    {
        "code": 6005,
        "name": "PoolAddressNotFound",
        "msg": "Pool address not found in config",
    },
    {
        "code": 6006,
        "name": "InvalidConfigPoolAddress",
        "msg": "Invalid pool address in config",
    },
    ],
};

async function CheckInit() {

    idl = await idl;
    const CONFIG_VALUE_LIMIT = 790
    // const program = configsProgram(connection)
    const program = new anchor.Program(IDL, new PublicKey("cnf9Q2MmjDVbzX1kjr8tEEtPJyB4e1avEuBMzWygnWo"), provider);

    const stakePool =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )

    const { stakePoolAddress: _, ...otherObject } = config
    const configString = JSON.stringify({
        stakePoolAddress: Object.keys(stakePool)[0].toString(),
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
            pubkey: new PublicKey(Object.keys(stakePool)[0]),
            isSigner: false,
            isWritable: false,
        },
        ])
        .instruction()
    tx.add(initIx)
    txs.push(tx)

    const recentBlockhash = connection.getLatestBlockhash()
    tx.feePayer = provider.wallet.wallet.value
    tx.recentBlockhash = recentBlockhash

    // await executeTransactions(provider.connection, txs, provider.wallet.wallet.value);
    // const signed = await provider.wallet.signAllTransactions(txs)
    // const txid = await sendAndConfirmTransaction(connection, tx, provider.wallet.wallet.value)
    
    console.log(stakePool)
}
async function CheckConfig() {

    idl = await idl;
    const config_program = new PublicKey("cnf9Q2MmjDVbzX1kjr8tEEtPJyB4e1avEuBMzWygnWo")
    // const programAccounts = await connection.getProgramAccounts(
    //     config_program,
    //     {
    //         filters: [
    //         {
    //             memcmp: {
    //             offset: 0,
    //             bytes: utils.bytes.bs58.encode(
    //                 BorshAccountsCoder.accountDiscriminator('ConfigEntry')
    //             ),
    //             },
    //         },
    //         ],
    //     }
    // );
    
    // const configDatas = [];
    // const coder = new BorshAccountsCoder(IDL);

    // programAccounts.forEach((account) => {
    //     try {
    //         const entryData = coder.decode('ConfigEntry', account.account.data);
    //         if (entryData) {
    //             configDatas.push({
    //             ...account,
    //             parsed: entryData,
    //         });
    //         }
    //     } catch (e) {
    //         // eslint-disable-next-line no-empty
    //     }
    // });
    // console.log(configDatas)
    
    const configdata =await fetchIdlAccountDataById(
        connection,
        [configEntryId],
        config_program,
        IDL
    )
    console.log(configdata)
}

</script>

<template>
    <div>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="CheckInit">
            <span>
                check metadata
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
            @click="CheckConfig">
            <span>
                check config
            </span>
        </button>
    </div>
</template>
