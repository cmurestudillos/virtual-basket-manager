<script setup lang="ts">
/**
 * La pista vista desde arriba, como en los mánager de toda la vida: diez fichas
 * con su dorsal, el balón y las líneas FIBA a escala.
 *
 * Dibuja la escena y nada más: quién va dónde lo decide el director de la
 * pista, y cuándo, el reloj de la retransmisión.
 */
import { computed } from 'vue';
import {
  CENTER_CIRCLE_RADIUS,
  COURT_LENGTH,
  COURT_WIDTH,
  HOOP_OFFSET,
  LANE_LENGTH,
  LANE_WIDTH,
  THREE_POINT_RADIUS,
  type CourtSide,
  type Kit
} from '@shared/domain/court';
import type { CourtScene } from '../composables/useCourtScene';

const props = defineProps<{
  scene: CourtScene;
  kits: Record<CourtSide, Kit>;
}>();

const MID_Y = COURT_WIDTH / 2;
/** Donde la recta del triple se junta con el arco, medido desde el fondo. */
const CORNER_Y = 0.9;
const cornerX = HOOP_OFFSET + Math.sqrt(THREE_POINT_RADIUS ** 2 - (MID_Y - CORNER_Y) ** 2);

function threePointPath(left: boolean): string {
  const base = left ? 0 : COURT_LENGTH;
  const corner = left ? cornerX : COURT_LENGTH - cornerX;
  const sweep = left ? 1 : 0;
  return `M ${base} ${CORNER_Y} L ${corner} ${CORNER_Y} A ${THREE_POINT_RADIUS} ${THREE_POINT_RADIUS} 0 0 ${sweep} ${corner} ${COURT_WIDTH - CORNER_Y} L ${base} ${COURT_WIDTH - CORNER_Y}`;
}

function freeThrowArc(left: boolean): string {
  const x = left ? LANE_LENGTH : COURT_LENGTH - LANE_LENGTH;
  const sweep = left ? 1 : 0;
  return `M ${x} ${MID_Y - CENTER_CIRCLE_RADIUS} A ${CENTER_CIRCLE_RADIUS} ${CENTER_CIRCLE_RADIUS} 0 0 ${sweep} ${x} ${MID_Y + CENTER_CIRCLE_RADIUS}`;
}

const players = computed(() => props.scene.players.value);
const ball = computed(() => props.scene.ball.value);
/** El balón crece con la altura: así se ve que va por el aire. */
const ballRadius = computed(() => 0.2 + Math.min(4, ball.value.z) * 0.035);
</script>

<template>
  <div class="relative overflow-hidden bg-tv-950">
    <svg
      :viewBox="`-1.2 -2.2 ${COURT_LENGTH + 2.4} ${COURT_WIDTH + 3.4}`"
      class="mx-auto block h-auto max-h-[62vh] w-full"
      role="img"
      aria-label="Pista del partido"
    >
      <!-- Parqué y líneas -->
      <rect
        x="-1.2"
        y="-2.2"
        :width="COURT_LENGTH + 2.4"
        :height="COURT_WIDTH + 3.4"
        fill="#120a2e"
      />
      <rect x="0" y="0" :width="COURT_LENGTH" :height="COURT_WIDTH" fill="#c8955a" />
      <g fill="#b07c45">
        <rect :x="0" :y="MID_Y - LANE_WIDTH / 2" :width="LANE_LENGTH" :height="LANE_WIDTH" />
        <rect
          :x="COURT_LENGTH - LANE_LENGTH"
          :y="MID_Y - LANE_WIDTH / 2"
          :width="LANE_LENGTH"
          :height="LANE_WIDTH"
        />
      </g>
      <g fill="none" stroke="#fdf6ec" stroke-width="0.06">
        <rect x="0" y="0" :width="COURT_LENGTH" :height="COURT_WIDTH" />
        <line :x1="COURT_LENGTH / 2" y1="0" :x2="COURT_LENGTH / 2" :y2="COURT_WIDTH" />
        <circle :cx="COURT_LENGTH / 2" :cy="MID_Y" :r="CENTER_CIRCLE_RADIUS" />
        <rect :x="0" :y="MID_Y - LANE_WIDTH / 2" :width="LANE_LENGTH" :height="LANE_WIDTH" />
        <rect
          :x="COURT_LENGTH - LANE_LENGTH"
          :y="MID_Y - LANE_WIDTH / 2"
          :width="LANE_LENGTH"
          :height="LANE_WIDTH"
        />
        <path :d="freeThrowArc(true)" />
        <path :d="freeThrowArc(false)" />
        <path :d="threePointPath(true)" />
        <path :d="threePointPath(false)" />
      </g>

      <!-- Tableros y aros -->
      <g stroke="#e2e8f0" stroke-width="0.08">
        <line x1="1.2" :y1="MID_Y - 0.9" x2="1.2" :y2="MID_Y + 0.9" />
        <line
          :x1="COURT_LENGTH - 1.2"
          :y1="MID_Y - 0.9"
          :x2="COURT_LENGTH - 1.2"
          :y2="MID_Y + 0.9"
        />
      </g>
      <g
        fill="none"
        stroke-width="0.07"
        :stroke="
          scene.shotResult.value === 'made'
            ? '#34d399'
            : scene.shotResult.value === 'missed'
              ? '#f87171'
              : '#ff9440'
        "
      >
        <circle :cx="HOOP_OFFSET" :cy="MID_Y" r="0.23" />
        <circle :cx="COURT_LENGTH - HOOP_OFFSET" :cy="MID_Y" r="0.23" />
      </g>

      <!-- Banquillos -->
      <g font-size="0.5" fill="#94a3b8">
        <text x="5.6" y="-1.5">Local</text>
        <text x="16.6" y="-1.5">Visitante</text>
      </g>

      <!-- Jugadores -->
      <g
        v-for="player in players"
        :key="player.playerId"
        :transform="`translate(${player.x} ${player.y})`"
      >
        <circle v-if="player.focus" r="0.62" fill="none" stroke="#fde68a" stroke-width="0.08" />
        <circle r="0.44" :fill="kits[player.side].shirt" stroke="#0b0f14" stroke-width="0.05" />
        <text
          text-anchor="middle"
          dominant-baseline="central"
          font-size="0.44"
          font-weight="700"
          :fill="kits[player.side].number"
        >
          {{ player.number }}
        </text>
      </g>

      <!-- Balón: sombra en el suelo y el balón a su altura -->
      <ellipse
        :cx="ball.x"
        :cy="ball.y + 0.12"
        :rx="0.18"
        :ry="0.1"
        fill="#000"
        :opacity="Math.max(0.1, 0.35 - ball.z * 0.05)"
      />
      <circle
        :cx="ball.x"
        :cy="ball.y - ball.z * 0.12"
        :r="ballRadius"
        fill="#ff7a1a"
        stroke="#3b1d06"
        stroke-width="0.04"
      />
    </svg>

    <p
      v-if="scene.caption.value"
      class="pointer-events-none absolute bottom-2 left-1/2 max-w-[90%] -translate-x-1/2 truncate bg-tv-800/90 px-3 py-1 text-sm font-semibold text-white"
    >
      {{ scene.caption.value }}
    </p>
  </div>
</template>
