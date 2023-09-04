<script setup>
import InitAll from '../components/InitAll.vue';
import StakingTest from '../components/StakingTest.vue';
import InitVer2 from '../components/InitVer2.vue'
</script>

<template>
    <div class="md:hero mx-auto p-4">
        <div class="md:hero-content flex flex-col">
            <h1 class="text-center text-5xl md:pl-12 font-bold text-transparent bg-clip-text bg-gradient-to-tr from-[#9945FF] to-[#14F195]">
          Staking Pool
        </h1>
            version1
            <div class="text-center">
                <init-all></init-all>
            </div>
            <div class="text-center">
                <staking-test></staking-test>
            </div>
            version2
            <div class="text-center">
                <init-ver2></init-ver2>
            </div>
      </div>
    </div>
</template>