<script setup>
import { findMintManagerId } from "@cardinal/creator-standard";
import { useWallet } from 'solana-wallets-vue'
import { 
  Transaction,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  ComputeBudgetProgram, 
  clusterApiUrl 
} from '@solana/web3.js';
import { 
  executeTransaction,
  fetchIdlAccount,
  executeTransactions,
  fetchIdlAccountDataById,
  findMintMetadataId,
  withFindOrInitAssociatedTokenAccount,
  decodeIdlAccount,
  tryNull,
  findTokenRecordId,findAta
} from "@cardinal/common";
const anchor = require('@project-serum/anchor');
const solana = require('@solana/web3.js');
import { utils,BN } from "@coral-xyz/anchor";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import { PROGRAM_ID as TOKEN_AUTH_RULES_ID } from "@metaplex-foundation/mpl-token-auth-rules";
import { 
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction ,
  getAccount,
  getMint,
  createTransferInstruction
} from "@solana/spl-token";//for staking 
const web3 = require("@solana/web3.js");
const wallet = useWallet();

let REWARDS_CENTER_ADDRESS = new PublicKey("DoEMN3BFKTMQDtD2gEfw8RUskZkURZxHQo1eiQkfVSqr");
let METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
let stakePoolIdentifier = `fortest`;

let rewardmintId = new solana.PublicKey('D8J6gcTSLPwXS9h4afZvDEQr2qGxscVfUPnrfbHQxhzJ')

let mintId = new solana.PublicKey('7qyA2nrzsrEi6zM5WzgFqeGkAmtwPsQddwove6rFBDSk')
let mintId1 = new solana.PublicKey('FDfBbcwtES5JLATLH5Z8SaAM11yHXt39Wy9Lp3aE6FdX')
let mintId2 = new solana.PublicKey('2gLkyYk9qKmjSWAt2f7bq5iPttBdUKSyjkqu3tbYv1UU')
let mintId3 = new solana.PublicKey('CHGkT63X3jGkBDbmcKx7s6rMiLzpFWfDAW3prNu6EF51')
let mintId4 = new solana.PublicKey('3DoVMikexhj3mpytnm1rhLZUZ41toPxNVR5Y6puYFRJp')
let mintId5 = new solana.PublicKey('3voHGYZ2JCVuJr9VjkkQXrcma97qkwExk4AGG5FMunPr')
let mintId6 = new solana.PublicKey('B1uvhSndwXpnNG8pe7bZ2MYxmPy9vfmsY52iuwDBMFBG')
let mintId7 = new solana.PublicKey('hS5ZVoV5vCbgxFsBAbw84KSVQu1ftNvv2gUv8JHENjH')
let mintId8 = new solana.PublicKey('C5rpAC6fw4oHPhuyEr7FCMtYoDh1Zdk8YBFUCyA8Qgqb')
let mintId9 = new solana.PublicKey('7AFKpDMoCmY8JDvxHzwmngvvQv9e6Qfu79xVNBJr46Ni')
let isFungible = false;

let connection = new anchor.web3.Connection(clusterApiUrl('devnet'))
let provider = new anchor.AnchorProvider(connection, wallet)
let idl = anchor.Program.fetchIdl(REWARDS_CENTER_ADDRESS, provider);

let stakePoolId = PublicKey.findProgramAddressSync(
      [
      utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
      utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
      ],
      REWARDS_CENTER_ADDRESS
  )[0];
let stakeEntryId = PublicKey.findProgramAddressSync(
    [
    utils.bytes.utf8.encode("stake-entry"),
    stakePoolId.toBuffer(),
    mintId.toBuffer(), // 不能在還沒有設定時這樣寫
    wallet.publicKey.value && isFungible ? wallet.publicKey.value.toBuffer() : PublicKey.default.toBuffer(),
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


function withRemainingAccountsForPaymentInfoSync(transaction, payer, paymentInfoData) {
  const remainingAccounts = [
    {
      pubkey: paymentInfoData.pubkey,
      isSigner: false,
      isWritable: false,
    },
  ];

  // add payer
  if (Number(paymentInfoData.parsed.paymentAmount) === 0)
    return remainingAccounts;

  remainingAccounts.push(
    ...withRemainingAccountsForPayment(
      transaction,
      payer,
      paymentInfoData.parsed.paymentMint,
      paymentInfoData.parsed.paymentShares.map(p => p.address)
    )
  );
  return remainingAccounts;
}
function withRemainingAccountsForPayment(transaction, payer, paymentMint, paymentTargets) {
  const remainingAccounts = [
    {
      pubkey: payer,
      isSigner: true,
      isWritable: true,
    },
  ];

  if (paymentMint.equals(PublicKey.default)) {
    remainingAccounts.push({
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    });
    remainingAccounts.push(
      ...paymentTargets.map(a => ({
        pubkey: a,
        isSigner: false,
        isWritable: true,
      }))
    );
  } else {
    remainingAccounts.push({
      pubkey: TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    });
    remainingAccounts.push({
      pubkey: getAssociatedTokenAddressSync(paymentMint, payer, true),
      isSigner: false,
      isWritable: true,
    });
    const ataIds = paymentTargets.map(a =>
      getAssociatedTokenAddressSync(paymentMint, a, true)
    );
    for (let i = 0; i < ataIds.length; i++) {
      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          payer,
          ataIds[i],
          paymentTargets[i],
          paymentMint
        )
      );
    }
    remainingAccounts.push(
      ...ataIds.map(id => ({
        pubkey: id,
        isSigner: false,
        isWritable: true,
      }))
    );
  }
  return remainingAccounts;
}

async function claimRewards(connection,wallet,stakePoolIdentifier,mintIds,rewardDistributorIds,claimingRewardsForUsers) {

  const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);

  const txs = [];
  const mints = mintIds.map(
    ({ mintId }) => {
  const stakeEntryId = PublicKey.findProgramAddressSync(
      [
      utils.bytes.utf8.encode("stake-entry"),
      stakePoolId.toBuffer(),
      mintId.toBuffer(),
      wallet.publicKey.value && isFungible ? wallet.publicKey.value.toBuffer() : PublicKey.default.toBuffer(),
      ],
      REWARDS_CENTER_ADDRESS
  )[0];
  return {
    mintId,
    stakeEntryId,
    rewardEntryIds: rewardDistributorIds?.map((rewardDistributorId) =>
      PublicKey.findProgramAddressSync(
          [
          utils.bytes.utf8.encode("reward-entry"),
          rewardDistributorId.toBuffer(),
          stakeEntryId.toBuffer(),
          ],
          REWARDS_CENTER_ADDRESS
      )[0]
    ),
  };
  });
  let accountDataById = await fetchIdlAccountDataById(
    connection, 
    [...(rewardDistributorIds ?? []),
    ...mints.map((m) => m.rewardEntryIds ?? []).flat(),
    ...(claimingRewardsForUsers
      ? mints.map((m) => PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("stake-entry"),
        stakePoolId.toBuffer(),
        m.mintId.toBuffer(),
        PublicKey.default.toBuffer()
        ],
        REWARDS_CENTER_ADDRESS
    )[0]).flat()
        : []),
    ],
    REWARDS_CENTER_ADDRESS,
    idl
    );
  const claimRewardsPaymentInfoIds = rewardDistributorIds?.map((id) => {
    const rewardDistributorData = accountDataById[id.toString()];
    if (
      rewardDistributorData &&
      rewardDistributorData.type === "rewardDistributor"
    ) {
      return rewardDistributorData.parsed.claimRewardsPaymentInfo;
    }
    return null;
  });
  const accountDataById2 = await fetchIdlAccountDataById(connection, [
    ...(claimRewardsPaymentInfoIds ?? []),
  ]);
  accountDataById = { ...accountDataById, ...accountDataById2 };
  for (const { stakeEntryId, rewardEntryIds } of mints) {
    const tx = new Transaction();
    if (
      rewardEntryIds &&
      rewardDistributorIds &&
      rewardDistributorIds?.length > 0
    ) {
      const ix = await program
        .methods.updateTotalStakeSeconds()
        .accounts({
          stakeEntry: stakeEntryId,
          updater: wallet.publicKey.value,
        })
        .instruction();
      tx.add(ix);
      for (let j = 0; j < rewardDistributorIds.length; j++) {
        const rewardDistributorId = rewardDistributorIds[j];
        const rewardDistributorData =
          accountDataById[rewardDistributorId.toString()];
        const rewardEntryId = rewardEntryIds[j];
        if (
          rewardEntryId &&
          rewardDistributorData &&
          rewardDistributorData.type === "RewardDistributor"
        ) {
          const rewardMint = rewardDistributorData.parsed.rewardMint;
          const rewardEntry = accountDataById[rewardEntryId?.toString()];
          const rewardDistributorTokenAccount = getAssociatedTokenAddressSync(
            rewardMint,
            rewardDistributorId,
            true,
          );
          const stakeEntryDataInfo = accountDataById[stakeEntryId.toString()];
          const userRewardMintTokenAccountOwnerId = stakeEntryDataInfo
            ? decodeIdlAccount(stakeEntryDataInfo, "stakeEntry").parsed
                .lastStaker
            : wallet.publicKey.value;

          const userRewardMintTokenAccount = await findAta(
            rewardMint,
            userRewardMintTokenAccountOwnerId,
            true
          );
          tx.add(
            createAssociatedTokenAccountIdempotentInstruction(
              wallet.publicKey.value,
              userRewardMintTokenAccount,
              userRewardMintTokenAccountOwnerId,
              rewardMint
            )
          );
          if (!rewardEntry) {
            const ix = await program
              .methods.initRewardEntry()
              .accounts({
                rewardEntry: PublicKey.findProgramAddressSync(
                    [
                    utils.bytes.utf8.encode("reward-entry"),
                    rewardDistributorId.toBuffer(),
                    stakeEntryId.toBuffer(),
                    ],
                    REWARDS_CENTER_ADDRESS
                )[0],
                rewardDistributor: rewardDistributorId,
                stakeEntry: stakeEntryId,
                payer: wallet.publicKey.value,
              })
              .instruction();
            tx.add(ix);
          }
          const remainingAccountsForPayment = [];
          const unstakePaymentInfo =
            accountDataById[
              rewardDistributorData.parsed.claimRewardsPaymentInfo.toString()
            ];
          const paymentInfoId = PublicKey.findProgramAddressSync(
              [
              utils.bytes.utf8.encode("payment-info"),
              utils.bytes.utf8.encode(stakePoolIdentifier),
              ],
              REWARDS_CENTER_ADDRESS
          )[0];
          const paymntinfo =await fetchIdlAccountDataById(
                connection,
                [paymentInfoId],
                REWARDS_CENTER_ADDRESS,
                idl
            )
          if (paymntinfo[Object.keys(paymntinfo)[0]] && paymntinfo[Object.keys(paymntinfo)[0]].type === "PaymentInfo") {//更改部分
            remainingAccountsForPayment.push(
              ...withRemainingAccountsForPaymentInfoSync(
                tx,
                wallet.publicKey.value,
                //unstakePaymentInfo
                paymntinfo[Object.keys(paymntinfo)[0]]
              )
            );
          }
          const ix = await program
            .methods.claimRewards()
            .accounts({
              rewardEntry: PublicKey.findProgramAddressSync(
                    [
                    utils.bytes.utf8.encode("reward-entry"),
                    rewardDistributorId.toBuffer(),
                    stakeEntryId.toBuffer(),
                    ],
                    REWARDS_CENTER_ADDRESS
                )[0],
              rewardDistributor: rewardDistributorId,
              stakeEntry: stakeEntryId,
              stakePool: stakePoolId,
              rewardMint: rewardMint,
              userRewardMintTokenAccount: userRewardMintTokenAccount,
              rewardDistributorTokenAccount: rewardDistributorTokenAccount,
              user: wallet.publicKey.value,
              tokenProgram:TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId
            })
            .remainingAccounts(remainingAccountsForPayment)//否則會出現account key不夠
            .instruction();
          tx.add(ix);
        }
      }
    }
    txs.push(tx);
  }
  return txs;
}

async function unstake(connection,wallet,stakePoolIdentifier,mintIds,rewardDistributorIds) {

  idl = await idl

  const program = new anchor.Program(await idl, REWARDS_CENTER_ADDRESS, provider);

  const txs = [];
  const mints = mintIds.map(({ mintId, fungible }) => {
    const stakeEntryId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("stake-entry"),
        stakePoolId.toBuffer(),
        mintId.toBuffer(),
        PublicKey.default.toBuffer(),
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
  return {
    mintId,
    stakeEntryId,
    rewardEntryIds: rewardDistributorIds?.map((rewardDistributorId) =>
    PublicKey.findProgramAddressSync(
      [
        utils.bytes.utf8.encode("reward-entry"),
        rewardDistributorId.toBuffer(),
        stakeEntryId.toBuffer(),
      ],
      REWARDS_CENTER_ADDRESS
    )[0]
    ),
  };
  });
  const distributor =await fetchIdlAccountDataById(
        connection,
        [rewardDistributorIds[0]],
        REWARDS_CENTER_ADDRESS,
        idl
    )

  let accountDataById = await fetchIdlAccountDataById(connection, [
    stakePoolId,
    ...mints.map((m) => m.rewardEntryIds ?? []).flat(),
    ...mints.map((m) => findMintManagerId(m.mintId)),
    ...mints.map((m) => m.stakeEntryId),
  ],
  REWARDS_CENTER_ADDRESS,
  idl
  );
  //const stakePoolData = accountDataById[stakePoolId.toString()];
  const stakePool =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        REWARDS_CENTER_ADDRESS,
        idl
    )
  const stakePoolData = stakePool[Object.keys(stakePool)[0]]
  if (!stakePoolData?.parsed || stakePoolData.type !== "StakePool") {
    throw "Stake pool not found";
  }
  const reward = await fetchIdlAccountDataById(
        connection,
        [rewardDistributorIds[0]],
        REWARDS_CENTER_ADDRESS,
        idl
    )
  const claimRewardsPaymentInfoIds = rewardDistributorIds?.map((id) => {
    const rewardDistributorData =reward[rewardDistributorIds[0]];
    if (
      rewardDistributorData &&
      rewardDistributorData.type === "RewardDistributor"
    ) {
      return rewardDistributorData.parsed.claimRewardsPaymentInfo;
    }
    return null;
  });
  const accountDataById2 = await fetchIdlAccountDataById(connection, [
    stakePoolData.parsed.unstakePaymentInfo,
    ...(claimRewardsPaymentInfoIds ?? [])
  ],
  REWARDS_CENTER_ADDRESS,
  idl
    );
  accountDataById = { ...accountDataById, ...accountDataById2, ...distributor };//add reward distributor
  for (const { mintId, stakeEntryId, rewardEntryIds } of mints) {
    const tx = new Transaction();
    const userEscrowId = PublicKey.findProgramAddressSync(
      [
        utils.bytes.utf8.encode("escrow"), 
        wallet.publicKey.toBuffer()
      ],
      REWARDS_CENTER_ADDRESS
    )[0];
    const userAtaId = getAssociatedTokenAddressSync(mintId, wallet.publicKey);
    const stakeEntry = accountDataById[stakeEntryId.toString()];
    if (
      rewardEntryIds &&
      rewardDistributorIds &&
      rewardDistributorIds.length > 0 &&
      !(
        stakeEntry?.type === "StakeEntry" &&
        stakeEntry.parsed.cooldownStartSeconds
      )
    ) {
      const ix = await program
        .methods.updateTotalStakeSeconds()
        .accounts({
          stakeEntry: stakeEntryId,
          updater: wallet.publicKey,
        })
        .instruction();
      tx.add(ix);
      for (let j = 0; j < rewardDistributorIds.length; j++) {
        const rewardDistributorId = rewardDistributorIds[j];
        const rewardDistributorData = accountDataById[rewardDistributorId.toString()];
        const rewardEntryId = rewardEntryIds[j];
        if (
          rewardEntryId &&
          rewardDistributorData &&
          rewardDistributorData.type === "RewardDistributor"
        ) {
          const rewardMint = rewardDistributorData.parsed.rewardMint;
          const rewardEntry = accountDataById[rewardEntryId?.toString()];
          const rewardDistributorTokenAccount = getAssociatedTokenAddressSync(
            rewardMint,
            rewardDistributorId,
            true
          );
          const userRewardMintTokenAccount = getAssociatedTokenAddressSync(
            rewardMint,
            wallet.publicKey,
            true
          );
          if (!rewardEntry) {
            const ix = await program
              .methods.initRewardEntry()
              .accounts({
                rewardEntry: PublicKey.findProgramAddressSync(
                    [
                    utils.bytes.utf8.encode("reward-entry"),
                    rewardDistributorId.toBuffer(),
                    stakeEntryId.toBuffer(),
                    ],
                    REWARDS_CENTER_ADDRESS
                )[0],
                rewardDistributor: rewardDistributorId,
                stakeEntry: stakeEntryId,
                payer: wallet.publicKey,
              })
             .instruction();
            tx.add(ix);
           }
          const remainingAccountsForPayment = [];
          const claimRewardsPaymentInfo =accountDataById[rewardDistributorData.parsed.claimRewardsPaymentInfo.toString()];
          if (
            claimRewardsPaymentInfo &&
            claimRewardsPaymentInfo.type === "PaymentInfo"
          ) {
            remainingAccountsForPayment.push(
              ...withRemainingAccountsForPaymentInfoSync(
                tx,
                wallet.publicKey,
                claimRewardsPaymentInfo
              )
            );
          }
          const ix = await program
            .methods.claimRewards()
            .accounts({
              rewardEntry: PublicKey.findProgramAddressSync(
                    [
                    utils.bytes.utf8.encode("reward-entry"),
                    rewardDistributorId.toBuffer(),
                    stakeEntryId.toBuffer(),
                    ],
                    REWARDS_CENTER_ADDRESS
                )[0],
              rewardDistributor: rewardDistributorId,
              stakeEntry: stakeEntryId,
              stakePool: stakePoolId,
              rewardMint: rewardMint,
              userRewardMintTokenAccount: userRewardMintTokenAccount,
              rewardDistributorTokenAccount: rewardDistributorTokenAccount,
              user: wallet.publicKey,
              tokenProgram:TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId
            })
            .remainingAccounts(remainingAccountsForPayment)
             .instruction();
          tx.add(ix);
        }
      }
    }
    const remainingAccounts = [];
    const unstakePaymentInfo =
      accountDataById[stakePoolData.parsed.unstakePaymentInfo.toString()];
    if (unstakePaymentInfo && unstakePaymentInfo.type === "PaymentInfo") {
      remainingAccounts.push(
        ...withRemainingAccountsForPaymentInfoSync(
          tx,
          wallet.publicKey,
          unstakePaymentInfo
        )
      );
    }
    const mintManagerId = findMintManagerId(mintId);
    const mintManagerAccountInfo = accountDataById[mintManagerId.toString()];
    const metadataId = findMintMetadataId(mintId);
    const metadata = await tryNull(
      Metadata.fromAccountAddress(connection, metadataId)
    );
    //start unstake
    const editionId = PublicKey.findProgramAddressSync(
        [
          utils.bytes.utf8.encode("metadata"),
          METADATA_PROGRAM_ID.toBuffer(),
          mintId.toBuffer(),
          utils.bytes.utf8.encode("edition"),
        ],
        METADATA_PROGRAM_ID//METADATA_PROGRAM_ID
      )[0];
    const stakeTokenRecordAccountId = findTokenRecordId(mintId, userAtaId);
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 100000000,
      })
    );
    const unstakeIx = await program
        .methods.unstakePnft()
        .accountsStrict({
          stakePool: stakePoolId,
          stakeEntry: stakeEntryId,
          stakeMint: mintId,
          stakeMintMetadata: metadataId,
          stakeMintEdition: editionId,
          stakeTokenRecordAccount: stakeTokenRecordAccountId,
          authorizationRules:
            metadata?.programmableConfig?.ruleSet ?? METADATA_PROGRAM_ID,
          user: wallet.publicKey,
          userEscrow: userEscrowId,
          userStakeMintTokenAccount: userAtaId,
          tokenMetadataProgram: METADATA_PROGRAM_ID,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          authorizationRulesProgram: TOKEN_AUTH_RULES_ID,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();
    tx.add(unstakeIx);
  
    txs.push(tx);
  }

  return txs;
}

async function stake(connection,wallet,stakePoolIdentifier,mintIds){

  idl = await idl
  const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
  const txs = [];
  const mints = mintIds.map(
    ({ mintId }) => {
      return {
        mintId,
        stakeEntryId: PublicKey.findProgramAddressSync(
            [
            utils.bytes.utf8.encode("stake-entry"),
            stakePoolId.toBuffer(),
            mintId.toBuffer(),
            PublicKey.default.toBuffer(),
            ],
            REWARDS_CENTER_ADDRESS
        )[0],
        mintTokenAccountId:getAssociatedTokenAddressSync(mintId, wallet.publicKey.value, true),
      };
    }
  );
  const accountDataById = await fetchIdlAccountDataById(connection, [
    stakePoolId,
    ...mints.map((m) => m.stakeEntryId),
    ...mints.map((m) => findMintManagerId(m.mintId)),
    ...mints.map((m) => findMintMetadataId(m.mintId)),
  ],
  REWARDS_CENTER_ADDRESS,
  idl
  );
  const stakePoolData = accountDataById[stakePoolId.toString()];
  if (!stakePoolData?.parsed || stakePoolData.type !== "StakePool") {
    throw "Stake pool not found";
  }
  const stakePaymentInfoData = await fetchIdlAccount(
    connection,
    stakePoolData.parsed.stakePaymentInfo,
    "PaymentInfo",
    idl
  );
  for (const { mintId, mintTokenAccountId, stakeEntryId } of mints) {
    const tx = new Transaction();
    const metadataId = findMintMetadataId(mintId);
    const mintManagerId = findMintManagerId(mintId);
    const mintManagerAccountInfo = accountDataById[mintManagerId.toString()];
    const metadataAccountInfo = accountDataById[metadataId.toString()];
    const metadataInfo = metadataAccountInfo
      ? Metadata.fromAccountInfo(metadataAccountInfo)[0]
      : undefined;
    if (!accountDataById[stakeEntryId.toString()]) {
      const ix = await program
        .methods.initEntry(wallet.publicKey.value)
        .accounts({
          stakeEntry: stakeEntryId,
          stakePool: stakePoolId,
          stakeMint: mintId,
          stakeMintMetadata: metadataId,
          payer: wallet.publicKey.value,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      tx.add(ix);
    }
    const userEscrowId = PublicKey.findProgramAddressSync(
        [utils.bytes.utf8.encode("escrow"), wallet.publicKey.value.toBuffer()],
        REWARDS_CENTER_ADDRESS
    )[0];
    const remainingAccounts = [
      ...withRemainingAccountsForPaymentInfoSync(
        tx,
        wallet.publicKey.value,
        stakePaymentInfoData
      ),
    ];
    const editionId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mintId.toBuffer(),
        utils.bytes.utf8.encode("edition"),
        ],
        METADATA_PROGRAM_ID
    )[0];
    const stakeTokenRecordAccountId = findTokenRecordId(
      mintId,
      mintTokenAccountId
    );
    // tx.add(
    //   ComputeBudgetProgram.setComputeUnitLimit({
    //     units: 100000000,
    //   })
    // );
    const stakeIx = await program
      .methods.stakePnft()
      .accountsStrict({
        stakePool: stakePoolId,
        stakeEntry: stakeEntryId,
        stakeMint: mintId,
        stakeMintMetadata: metadataId,
        stakeMintEdition: editionId,
        stakeTokenRecordAccount: stakeTokenRecordAccountId,
        authorizationRules:
          metadataInfo?.programmableConfig?.ruleSet ?? METADATA_PROGRAM_ID,
        user: wallet.publicKey.value,
        userEscrow: userEscrowId,
        userStakeMintTokenAccount: mintTokenAccountId,
        tokenMetadataProgram: METADATA_PROGRAM_ID,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        authorizationRulesProgram: TOKEN_AUTH_RULES_ID,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();
    tx.add(stakeIx);   
    txs.push(tx);
  }

  return txs;
}

async function staking() {
  const tx = await stake(connection,provider.wallet,stakePoolIdentifier,
  [ {mintId:mintId},{mintId:mintId1} ]
  )
  await executeTransactions(connection,tx,provider.wallet.wallet.value);
  console.log(tx)
}
async function check() {

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
  const reward =await fetchIdlAccountDataById(
        connection,
        [rewardDistributorId],
        REWARDS_CENTER_ADDRESS,
        idl
    )

  // console.log('last staked at :',entry[Object.keys(entry)[0]].parsed.lastStakedAt.words[0])
  // console.log('last updated at :',entry[Object.keys(entry)[0]].parsed.lastUpdatedAt.words[0])
  // console.log("total staked second :",entry[Object.keys(entry)[0]].parsed.totalStakeSeconds.words[0])
  const userAtaId = getAssociatedTokenAddressSync(mintId, wallet.publicKey.value);
  const stakeTokenRecordAccountId = findTokenRecordId(mintId, userAtaId);

  console.log(stakeTokenRecordAccountId)

}
async function claim_reward () {
    
  const tx = await claimRewards(connection,provider.wallet,stakePoolIdentifier,[{ mintId:mintId1 }],[rewardDistributorId])
  await executeTransactions(connection,tx,provider.wallet.wallet.value);
  console.log(tx)

}
async function transfer_fund () {

    const tx = new Transaction()

    const userRewardMintAta = getAssociatedTokenAddressSync(
      rewardmintId,
        wallet.publicKey.value
    );
    const rewardDistributorAtaId = await withFindOrInitAssociatedTokenAccount(
        tx,
        connection,
        rewardmintId,
        rewardDistributorId,
        wallet.publicKey.value,
        true
    );
    tx.add(
        createTransferInstruction(
        userRewardMintAta,
        rewardDistributorAtaId,
        wallet.publicKey.value,
        //117600000*(10**6)
        10000000000
        )
    );
    await executeTransaction(connection, tx, provider.wallet.wallet.value);
    // const reward =await fetchIdlAccountDataById(
    //     connection,
    //     [rewardDistributorId],
    //     new PublicKey("HWRCpfsR3UkM3LTvtbZLYQFcXXujLedXPy6QeUYKo1jn"),
    //     idl
    // )
    // const rewardDistributorAta = await getAccount(
    // provider.connection,
    // rewardDistributorAtaId
    // );
    //const amountAfter = Number(rewardDistributorAta.amount);
    //console.log('Fund :',rewardDistributorAta.amount)
    //console.log(rewardDistributorAtaId)
    // const rewardDistributorAta = await getAccount(
    //   connection,
    //   rewardDistributorAtaId
    // );
    console.log(rewardDistributorAtaId)
}
async function unstaking () {

  const tx = await unstake(provider.connection, provider.wallet.wallet.value, stakePoolIdentifier, 
  [ {mintId:mintId},{mintId:mintId1},{mintId:mintId2},{mintId:mintId3} ,{mintId:mintId4},
  {mintId:mintId5} ,{mintId:mintId6},{mintId:mintId7} ,{mintId:mintId8},{mintId:mintId9} ],
  [rewardDistributorId]
  )
  await executeTransactions(connection,tx,provider.wallet.wallet.value);
  console.log(tx)

}
async function reclaim_fund () {

  const program = new anchor.Program(idl, REWARDS_CENTER_ADDRESS, provider);
  const tx = new Transaction()
  const rewardDistributor = await fetchIdlAccountDataById(
    connection,
    [rewardDistributorId],
    new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL"),
    idl
  )

  const rewardDistributorTokenAccount = await findAta(
    rewardDistributor[Object.keys(rewardDistributor)[0]].parsed.rewardMint,
    rewardDistributor[Object.keys(rewardDistributor)[0]].pubkey,
    true
  )

  const authorityTokenAccount = await withFindOrInitAssociatedTokenAccount(
    tx,
    connection,
    rewardDistributor[Object.keys(rewardDistributor)[0]].parsed.rewardMint,
    wallet.publicKey.value,
    wallet.publicKey.value,
    true
  )
  //剩餘數量
  const rewardDistributorAtaId = await withFindOrInitAssociatedTokenAccount(
    tx,
    connection,
    new PublicKey('D8J6gcTSLPwXS9h4afZvDEQr2qGxscVfUPnrfbHQxhzJ'),
    rewardDistributorId,
    wallet.publicKey.value,
    true
  );
  
  const rewardDistributorAta = await getAccount(
    connection,
    rewardDistributorAtaId
  );

  const reclaim = await program.methods
    .reclaimFunds(new BN(rewardDistributorAta.amount))
    .accounts({
      rewardDistributor:rewardDistributor[Object.keys(rewardDistributor)[0]].pubkey,
      rewardDistributorTokenAccount:rewardDistributorTokenAccount,
      authorityTokenAccount:authorityTokenAccount,
      authority: provider.wallet.publicKey.value,
      tokenProgram:TOKEN_PROGRAM_ID,
    })
    .instruction();
  tx.add(reclaim)
  await executeTransaction(connection, tx, provider.wallet.wallet.value);

}
</script>

<template>
    <div>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r"
            @click="staking">
            <span>
               Staking
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r"
            @click="unstaking">
            <span>
              Unstaking
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r"
            @click="check">
            <span>
               Check
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r"
            @click="claim_reward">
            <span>
               Claim reward
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r"
            @click="transfer_fund">
            <span>
                transfer fund
            </span>
        </button>
        <button
            class="px-8 m-2 btn animate-pulse bg-gradient-to-r"
            @click="reclaim_fund">
            <span>
                reclaim fund
            </span>
        </button>
    </div>
</template>
