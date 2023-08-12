<script setup>
import { useWallet } from 'solana-wallets-vue'
import { Connection, SystemProgram,Keypair,clusterApiUrl, Transaction,PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount,createTransferInstruction } from '@solana/spl-token';
import bs58 from "bs58";
import { ref } from 'vue'
import axios from 'axios'
var CryptoJS = require("crypto-js");

const token = ref(196)
const user_id = ref(0)
const num = ref(0)
const responseData = ref(null)

async function fetchData() {
    try {
    const response = await axios.get("https://api.tdtn.tw/v1/gamer/info?gamer_id=1&mode=detail&lang=zh-TW")
    responseData.value = response.data
    user_id.value = responseData.value.Result.user_data.user_id
    
    } catch (error) {
    console.error(error)
    }
}
function decreaseToken(num) {
if (num <= token.value) {
    token.value -= num
    console.log('token total decreased')
} else {
    alert("You cannot claim more tokens than your balance.")
}
}

fetchData()
const { publicKey, connected, sendTransaction } = useWallet();
const onClick = async () => { 
    if (!publicKey) {
        console.log('error', `Send Transaction: Wallet not connected!`);
        return;
    }
    if (num.value > token.value) {
    console.log('error', 'Number of tokens exceeds the available balance!');
    return;
    }
    let signature = '';
    try {
        var bytes  = CryptoJS.AES.decrypt(process.env.VUE_APP_SECRET_CRYPTION, process.env.VUE_APP_CRYPTION);
        var SecretKey = bytes.toString(CryptoJS.enc.Utf8);

        const myWalletSecretKey = bs58.decode(SecretKey);
        const fromWallet = Keypair.fromSecretKey(myWalletSecretKey);
        const mint =new PublicKey('HpgFJcyBpAAFKMHFjp5Lq3KaCiAqhgcV5SLV5GmjAoi9')
        const QUICKNODE_RPC = process.env.VUE_APP_RPC;
        const connection = new Connection(QUICKNODE_RPC, 'confirmed');

        const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            fromWallet,
            mint,
            fromWallet.publicKey
            );
        const toTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            fromWallet,
            mint, 
            publicKey.value
            );
            console.log(`Creating and Sending Transaction`);
        const tx = new Transaction().add(
            createTransferInstruction(
            fromTokenAccount.address,
            toTokenAccount.address,
            fromWallet.publicKey,
            1000000000*num.value,
        ))
        console.log('create transfer instruction')
        const latestBlockHash = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = latestBlockHash.blockhash;    
        tx.feePayer = publicKey.value;
        console.log('feepayer: ',tx.feePayer.toString())
        console.log('blockhash: ',tx.recentBlockhash)

        signature = await sendTransaction(
            tx,
            connection,
            {
            signers:[fromWallet]
            }
            )
        console.log(token.value)
        console.log('finish transfer')
        decreaseToken(num.value); 
    } catch (error) {
        console.log('error', `Transaction failed! ${error?.message}`, signature);
        return;
    }
}
</script>


<template>
    <div>
        <p>user id : {{ user_id }}</p>
        can claim token balance : {{ token }} <br>
        choose amount : <input type="number" v-model="num" />
        <button
            class="group w-60 m-2 btn animate-pulse disabled:animate-none bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ... "
            @click="onClick" :disabled="! publicKey || num > token">
            
            <div v-if="connected">
                <div v-if="token > 0">
                    claim
                </div>
                <div v-else>
                    you have no enough token to claim
                    </div>
            </div>

            <div v-else>
                Wallet not connected
            </div>
        </button>
    </div>
</template>
