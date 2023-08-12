<script setup>
import { findMintManagerId } from "@cardinal/creator-standard";
import { useWallet } from 'solana-wallets-vue'
import { Transaction,PublicKey,SystemProgram,SYSVAR_INSTRUCTIONS_PUBKEY,ComputeBudgetProgram } from '@solana/web3.js';
import { executeTransaction,fetchIdlAccount,executeTransactions,fetchIdlAccountDataById,findMintMetadataId,withFindOrInitAssociatedTokenAccount,decodeIdlAccount,tryNull,findTokenRecordId,findAta} from "@cardinal/common";
const anchor = require('@project-serum/anchor');
const solana = require('@solana/web3.js');
import { utils,BN } from "@coral-xyz/anchor";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import { PROGRAM_ID as TOKEN_AUTH_RULES_ID } from "@metaplex-foundation/mpl-token-auth-rules";
import { getAssociatedTokenAddressSync,getOrCreateAssociatedTokenAccount,TOKEN_PROGRAM_ID,createAssociatedTokenAccountIdempotentInstruction ,getAccount,getMint} from "@solana/spl-token";//for staking 
import { createTransferInstruction} from "@solana/spl-token";
const web3 = require("@solana/web3.js");
const wallet = useWallet();
// for staking 
async function withRemainingAccountsForPaymentInfo(connection, transaction, payer, paymentInfo , idl) {

  const paymentInfoDataId = await fetchIdlAccountDataById(connection, [paymentInfo], new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL"),idl);
  const paymentInfoData = paymentInfoDataId[Object.keys(paymentInfoDataId)[0]]
  const remainingAccounts = [
    {
      pubkey: paymentInfo,
      isSigner: false,
      isWritable: false,
    },
  ];

  // add payer
  if (Number(paymentInfoData.parsed.paymentAmount) === 0 )
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
  const provider = new anchor.AnchorProvider(connection, wallet)
  const stakingprogram = new solana.PublicKey('kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL');
  const idl = await anchor.Program.fetchIdl(stakingprogram, provider);
  const program = new anchor.Program(idl, stakingprogram, provider);
  const isFungible = false;
  const REWARDS_CENTER_ADDRESS = new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL");
  const stakePoolId = PublicKey.findProgramAddressSync(
      [
      utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
      utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
      ],
      REWARDS_CENTER_ADDRESS // REWARDS_CENTER_ADDRESS
  )[0];
  const txs = [];
  for (const mintId of mintIds) {
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
        new solana.PublicKey('8vMQNxJXtG4rrqVQufS3yt8rh4ZUMw3Qe6KoyrHDLH7D').toBuffer(),
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
            //new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL")
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
              new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL") 
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
  }
  return txs;
}
async function unstake(connection,wallet,stakePoolIdentifier,mintIds,rewardDistributorIds) {
  const provider = new anchor.AnchorProvider(connection, wallet)
  const stakingprogram = new solana.PublicKey('kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL');
  const idl = await anchor.Program.fetchIdl(stakingprogram, provider);
  const program = new anchor.Program(idl, stakingprogram, provider);
  // 完成未定义的辅助函数定义和导入，例如 findStakePoolId、findStakeEntryId 等
  const REWARDS_CENTER_ADDRESS = new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL")
  const stakePoolId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
        utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL") // REWARDS_CENTER_ADDRESS
    )[0];
  const txs = [];
  for (const mintId of mintIds) {
  const mints = mintIds.map(({ mintId, fungible }) => {
  const stakeEntryId = PublicKey.findProgramAddressSync(
      [
      utils.bytes.utf8.encode("stake-entry"),
      stakePoolId.toBuffer(),
      mintId.toBuffer(),
      PublicKey.default.toBuffer(),
      ],
      new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL")
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
        new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL"),
        idl
    )

  let accountDataById = await fetchIdlAccountDataById(connection, [
    stakePoolId,
    ...mints.map((m) => m.rewardEntryIds ?? []).flat(),
    ...mints.map((m) => findMintManagerId(m.mintId)),
    ...mints.map((m) => m.stakeEntryId),
  ],
  new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL"),
  idl
  );
  //const stakePoolData = accountDataById[stakePoolId.toString()];
  const stakePool =await fetchIdlAccountDataById(
        connection,
        [stakePoolId],
        new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL"),//新增1
        idl//新增2
    )
  const stakePoolData = stakePool[Object.keys(stakePool)[0]]
  if (!stakePoolData?.parsed || stakePoolData.type !== "StakePool") {
    throw "Stake pool not found";
  }
  const reward = await fetchIdlAccountDataById(
        connection,
        [rewardDistributorIds[0]],
        new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL"),
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
  new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL"),
  idl
    );
  const distributorKey = Object.keys(distributor)[0];
  const desiredResult = { [distributorKey]: distributor[Object.keys(distributor)[0]] };//CobK936QFpKL4NUyeM332NFsJTagnXkjgrMpegwtvwms
  accountDataById = { ...accountDataById, ...accountDataById2, ...{"7Zg35Yzy5Lnj74v6Qcyy4NVjyb5vMQSTkKbT3mCoQzER" : distributor[Object.keys(distributor)[0]]} };//add reward distributor
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
                payer: wallet.publicKey.value,
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
              user: wallet.publicKey.value,
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
    const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
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
  }}
  return txs;
}
async function stake(connection,wallet,stakePoolIdentifier,mintIds){
  const REWARDS_CENTER_ADDRESS = new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL")
  const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
  const provider = new anchor.AnchorProvider(connection, wallet)
  const stakingprogram = new solana.PublicKey('kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL');
  const idl = await anchor.Program.fetchIdl(stakingprogram, provider);
  const program = new anchor.Program(idl, stakingprogram, provider);
  const stakePoolId = PublicKey.findProgramAddressSync(
        [
        utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
        utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
        ],
        new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL") // REWARDS_CENTER_ADDRESS
    )[0];
  const txs = [];
  for (const mintId of mintIds) {
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
            new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL")
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
  new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL"),
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
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 100000000,
      })
    );
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
  }
  return txs;
}

async function staking() {
  const mintId = new solana.PublicKey('A5sq6uMyRwRubwbw2nDkmwGsXHgq5c5c7H6cShpqLAT7')
  const mintId1 = new solana.PublicKey('4wgetERVBqVWBkiFhaekvgRDE1bZvtpdFxEVUUgzNfMR')
  const mintId2 = new solana.PublicKey('HABAjSiuCg8TCy68BGWb89ChRBxEVGs7naScQKhvByms')
  const stakePoolIdentifier = `whatthefuck`;
  const connection = new anchor.web3.Connection(solana.clusterApiUrl('devnet'),"confirmed")
  const provider = new anchor.AnchorProvider(connection, wallet)
  const tx = await stake(connection,provider.wallet,stakePoolIdentifier,[ {mintId:mintId} ])
  //await executeTransactions(connection,tx,provider.wallet.wallet.value);
  console.log(tx)
}
async function check() {
  const rewardmintId = new solana.PublicKey('D8J6gcTSLPwXS9h4afZvDEQr2qGxscVfUPnrfbHQxhzJ')
  const isFungible = false;
  // const mintId = new solana.PublicKey('A5sq6uMyRwRubwbw2nDkmwGsXHgq5c5c7H6cShpqLAT7')
  const mintId = new solana.PublicKey('AvLRi7Ji1UMDRRgi1omE9kWtthK6ZdrUiQzYnWmRp3b1')
  const REWARDS_CENTER_ADDRESS = new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL")
  const stakePoolIdentifier = `whatthefuck`;
  const connection = new anchor.web3.Connection(solana.clusterApiUrl('devnet'),"confirmed")
  const provider = new anchor.AnchorProvider(connection, wallet)
  const stakingprogram = new solana.PublicKey('kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL');
  const idl = await anchor.Program.fetchIdl(stakingprogram, provider);
  const program = new anchor.Program(idl, stakingprogram, provider);
  const stakePoolId = PublicKey.findProgramAddressSync(
      [
      utils.bytes.utf8.encode('stake-pool'),// STAKE_POOL_PREFIX.as_bytes()
      utils.bytes.utf8.encode(stakePoolIdentifier), // ix.identifier.as_ref()
      ],
      REWARDS_CENTER_ADDRESS
  )[0];
  const stakeEntryId = PublicKey.findProgramAddressSync(
      [
      utils.bytes.utf8.encode("stake-entry"),
      stakePoolId.toBuffer(),
      mintId.toBuffer(), // 不能在還沒有設定時這樣寫
      wallet.publicKey.value && isFungible ? wallet.publicKey.value.toBuffer() : PublicKey.default.toBuffer(),
      ],
      new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL")
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
  const stakePool =await fetchIdlAccountDataById(
      connection,
      [stakePoolId],
      new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL"),
      idl
  )
  const entry = await fetchIdlAccountDataById(
      connection,
      [stakeEntryId],
      new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL"),
      idl
  )
  const reward =await fetchIdlAccountDataById(
        connection,
        [rewardDistributorId],
        new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL"),
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
  const mintId1 = new solana.PublicKey('EqzgifDHnZod63LdWAzPvPsxntarKTU9ssaHiWmYWKj1')
  const mintId2 = new solana.PublicKey('HABAjSiuCg8TCy68BGWb89ChRBxEVGs7naScQKhvByms')
  const REWARDS_CENTER_ADDRESS = new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL")
  const stakePoolIdentifier = `final-3`;
  const connection = new anchor.web3.Connection(solana.clusterApiUrl('devnet'),"confirmed")
  const provider = new anchor.AnchorProvider(connection, wallet)
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
    
  const tx = await claimRewards(connection,provider.wallet,stakePoolIdentifier,[{ mintId:mintId1 }],[rewardDistributorId])
  await executeTransactions(connection,tx,provider.wallet.wallet.value);
  console.log(tx)
}
async function transfer_fund () {
    const REWARDS_CENTER_ADDRESS = new PublicKey("E2PSH444f3ScPpuNChXYLrv7KfcWWNdJvQKwfkaw3wM");
    const stakePoolIdentifier = `TTG`;
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
        //(stakePoolIdentifier ?? new BN(0)).toArrayLike(Buffer, "le", 8),
        new BN(0).toArrayLike(Buffer, "le", 8)
        ],
        REWARDS_CENTER_ADDRESS
    )[0];
    const mint =new PublicKey('2tiniRaY93hU9tEpoAe4xy9hHLy1FpLt4zEjHhe1K3r4')
    const stakingprogram = new solana.PublicKey('E2PSH444f3ScPpuNChXYLrv7KfcWWNdJvQKwfkaw3wM');
    const connection = new anchor.web3.Connection('https://icy-morning-waterfall.solana-mainnet.quiknode.pro/1d4818ff9d1be4c175581c59ddcff56efd9731e6/')
    const provider = new anchor.AnchorProvider(connection, wallet)
    const idl = await anchor.Program.fetchIdl(stakingprogram, provider);

    const tx = new Transaction()
    const userRewardMintAta = getAssociatedTokenAddressSync(
        mint,
        wallet.publicKey.value
    );
    const rewardDistributorAtaId = await withFindOrInitAssociatedTokenAccount(
        tx,
        connection,
        mint,
        rewardDistributorId,
        wallet.publicKey.value,
        true
    );
    tx.add(
        createTransferInstruction(
        userRewardMintAta,
        rewardDistributorAtaId,
        wallet.publicKey.value,
        117600000*(10**6)
        //10000000000
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
  const mintId1 = new solana.PublicKey('4wgetERVBqVWBkiFhaekvgRDE1bZvtpdFxEVUUgzNfMR')
  const mintId = new solana.PublicKey('EqzgifDHnZod63LdWAzPvPsxntarKTU9ssaHiWmYWKj1')
  const mintId2 = new solana.PublicKey('HABAjSiuCg8TCy68BGWb89ChRBxEVGs7naScQKhvByms')
  const REWARDS_CENTER_ADDRESS = new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL")
  const stakePoolIdentifier = `whatthefuck`;
  const connection = new anchor.web3.Connection(solana.clusterApiUrl('devnet'),"confirmed")
  const provider = new anchor.AnchorProvider(connection, wallet)
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
  const tx = await unstake(provider.connection, provider.wallet.wallet.value, stakePoolIdentifier, [{ mintId:mintId }],[rewardDistributorId])
  await executeTransactions(connection,tx,provider.wallet.wallet.value);
  console.log(tx)
}
async function reclaim_fund () {
  const REWARDS_CENTER_ADDRESS = new PublicKey("kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL");
  const stakePoolIdentifier = `whatthefuck`;
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
  const stakingprogram = new solana.PublicKey('kEPmMt7hPPKA6oYVVxmLvjM2ZwkqMP33aMbrC6N5ntL');
  const connection = new anchor.web3.Connection(solana.clusterApiUrl('devnet'),"confirmed")
  const provider = new anchor.AnchorProvider(connection, wallet)
  const idl = await anchor.Program.fetchIdl(stakingprogram, provider);
  const program = new anchor.Program(idl, stakingprogram, provider);
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
