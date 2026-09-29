<script setup lang="ts">
/**
 * Un trofeo pequeño y quieto, para las vitrinas: la misma copa que se levanta
 * en la pantalla de campeón, dibujada una sola vez por tipo y servida como
 * imagen (ver `trophy-thumbnail.ts`).
 *
 * three.js se carga aparte y después de pintar: mientras llega —y para
 * siempre si el equipo no puede dibujar en 3D— se ve el trofeo plano del kit
 * (`TrophyIcon`) en el mismo metal, así que la vitrina nunca tiene huecos.
 */
import { onMounted, ref, watch } from 'vue';
import { TROPHY_DESIGN, type TrophyKind } from '@shared/domain/trophies';
import { TrophyIcon } from '@renderer/shared/ui';

const props = withDefaults(defineProps<{ kind: TrophyKind; size?: number; label?: string }>(), {
  size: 56,
  label: ''
});

const source = ref<string | null>(null);

async function load(): Promise<void> {
  try {
    const { trophyThumbnail } = await import('../trophy-thumbnail');
    source.value = trophyThumbnail(props.kind);
  } catch {
    source.value = null;
  }
}

onMounted(load);
watch(() => props.kind, load);
</script>

<template>
  <img
    v-if="source"
    :src="source"
    :width="size"
    :height="size"
    :alt="label"
    :data-trophy="kind"
    class="shrink-0 object-contain"
    draggable="false"
  />
  <TrophyIcon
    v-else
    :metal="TROPHY_DESIGN[kind].metal"
    :size="size"
    :label="label"
    :data-trophy="kind"
  />
</template>
