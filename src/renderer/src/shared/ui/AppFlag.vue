<script setup lang="ts">
import { computed } from 'vue';
import { flagUrl } from './flags';

/**
 * La bandera de una nacionalidad, del tamaño de una línea de texto. Sin bandera
 * conocida se queda el código, que se lee igual de bien.
 */

const props = withDefaults(
  defineProps<{ code: string | null | undefined; label?: string; size?: 'sm' | 'md' | 'lg' }>(),
  { label: undefined, size: 'sm' }
);

const url = computed(() => flagUrl(props.code));
const SIZES = { sm: 'h-3 w-4', md: 'h-4 w-[1.35rem]', lg: 'h-6 w-8' } as const;
</script>

<template>
  <img
    v-if="url"
    :src="url"
    :alt="label ?? code ?? ''"
    :title="label ?? code ?? ''"
    class="inline-block shrink-0 rounded-[2px] object-cover align-[-0.125em] shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
    :class="SIZES[size]"
  />
  <span v-else-if="code" class="text-xs text-court-300">{{ code }}</span>
</template>
