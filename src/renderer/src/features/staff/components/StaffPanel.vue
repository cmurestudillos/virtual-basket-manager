<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { StaffMember, TeamStaff } from '@shared/contracts/staff.contract';
import { STAFF_ROLES } from '@shared/domain/staff';
import { formatMoney } from '@renderer/shared/format';
import PageActions from '@renderer/features/app-shell/components/PageActions.vue';
import {
  AppAvatar,
  AppButton,
  AppEmpty,
  AppFlag,
  AppPanel,
  AppSectionTitle,
  AppStars,
  AppTabs,
  KeyValueList,
  TONE_TEXT
} from '@renderer/shared/ui';

/**
 * El cuerpo técnico, como los empleados de IBM: la nómina y los libres en
 * tablas, la ficha del elegido a la derecha y, abajo, despedirlo o contratarlo.
 * Se elige pulsando la fila.
 */

const props = defineProps<{ teamId: string }>();

const staff = ref<TeamStaff | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
const roleFilter = ref<string>('');
const selectedId = ref<string | null>(null);

const candidates = computed(() => {
  const all = staff.value?.candidates ?? [];
  return roleFilter.value ? all.filter((member) => member.role === roleFilter.value) : all;
});

/** El filtro de puestos: los que tienen algún libre, y cuáles están vacantes. */
const roleOptions = computed(() => {
  const all = staff.value?.candidates ?? [];
  const vacant = new Set(staff.value?.vacancies.map((vacancy) => vacancy.role) ?? []);
  return [
    { id: '', label: 'Todos' },
    ...STAFF_ROLES.flatMap((role) => {
      const member = all.find((candidate) => candidate.role === role);
      return member
        ? [{ id: role, label: member.roleLabel, hint: vacant.has(role) ? ' · vacante' : '' }]
        : [];
    })
  ];
});

const selectedMember = computed(
  () => staff.value?.members.find((member) => member.id === selectedId.value) ?? null
);
const selectedCandidate = computed(
  () => staff.value?.candidates.find((member) => member.id === selectedId.value) ?? null
);
const selected = computed(() => selectedMember.value ?? selectedCandidate.value);

const facts = computed(() =>
  selected.value
    ? [
        { id: 'role', label: 'Puesto', value: selected.value.roleLabel },
        { id: 'level', label: 'Nivel' },
        { id: 'wage', label: 'Ficha', value: `${formatMoney(selected.value.wageCents)} al año` },
        {
          id: 'status',
          label: 'Situación',
          value: selectedMember.value ? 'En nómina' : 'Libre'
        }
      ]
    : []
);

onMounted(load);

async function load(): Promise<void> {
  staff.value = await window.api.staff.get(props.teamId);
}

async function run(action: () => Promise<TeamStaff>): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    staff.value = await action();
    selectedId.value = null;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo hacer la operación';
  } finally {
    busy.value = false;
  }
}

function hire(member: StaffMember): void {
  void run(() => window.api.staff.hire({ teamId: props.teamId, staffId: member.id }));
}

function fire(member: StaffMember): void {
  void run(() => window.api.staff.fire({ teamId: props.teamId, staffId: member.id }));
}

function select(member: StaffMember): void {
  selectedId.value = member.id;
}
</script>

<template>
  <div v-if="staff" class="grid grid-cols-[minmax(0,1fr)_18rem] items-start gap-4">
    <div class="flex min-w-0 flex-col gap-4">
      <AppPanel
        title="En nómina"
        :hint="`${formatMoney(staff.monthlyWagesCents)}/mes · ${formatMoney(staff.seasonWagesCents)} al año`"
        flush
      >
        <table class="data-table">
          <thead>
            <tr>
              <th>Técnico</th>
              <th>Puesto</th>
              <th>Nivel</th>
              <th>Qué aporta</th>
              <th class="numeric">Ficha</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="member in staff.members"
              :key="member.id"
              class="cursor-pointer"
              :class="member.id === selectedId ? 'is-selected' : ''"
              tabindex="0"
              @click="select(member)"
              @keydown.enter.prevent="select(member)"
              @keydown.space.prevent="select(member)"
            >
              <td>
                <span class="flex items-center gap-2">
                  <AppAvatar kind="staff" :seed="member.id" :name="member.name" />
                  <AppFlag :code="member.nationality" />
                  {{ member.name }}
                </span>
              </td>
              <td>{{ member.roleLabel }}</td>
              <td :title="member.levelLabel">
                <AppStars :value="member.level" :label="`Nivel: ${member.levelLabel}`" />
              </td>
              <td class="whitespace-normal">{{ member.effect }}</td>
              <td class="numeric">{{ formatMoney(member.wageCents) }}</td>
            </tr>
            <tr v-for="vacancy in staff.vacancies" :key="vacancy.role">
              <td class="text-tv-muted">Puesto vacante</td>
              <td>{{ vacancy.roleLabel }}</td>
              <td colspan="3" class="whitespace-normal text-tv-muted">{{ vacancy.roleHint }}</td>
            </tr>
          </tbody>
        </table>
      </AppPanel>

      <AppPanel title="Técnicos libres" :hint="`${candidates.length} libres`" flush>
        <div class="p-3">
          <AppTabs v-model="roleFilter" variant="pills" :options="roleOptions" />
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Técnico</th>
              <th>Puesto</th>
              <th>Nivel</th>
              <th>Qué aporta</th>
              <th class="numeric">Ficha</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="candidates.length === 0">
              <td colspan="5" class="text-tv-muted">No hay nadie libre para ese puesto.</td>
            </tr>
            <tr
              v-for="member in candidates"
              :key="member.id"
              class="cursor-pointer"
              :class="member.id === selectedId ? 'is-selected' : ''"
              tabindex="0"
              @click="select(member)"
              @keydown.enter.prevent="select(member)"
              @keydown.space.prevent="select(member)"
            >
              <td>
                <span class="flex items-center gap-2">
                  <AppAvatar kind="staff" :seed="member.id" :name="member.name" />
                  <AppFlag :code="member.nationality" />
                  {{ member.name }}
                </span>
              </td>
              <td>{{ member.roleLabel }}</td>
              <td :title="member.levelLabel">
                <AppStars :value="member.level" :label="`Nivel: ${member.levelLabel}`" />
              </td>
              <td class="whitespace-normal">{{ member.effect }}</td>
              <td class="numeric">{{ formatMoney(member.wageCents) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-3 py-2 text-xs text-tv-muted">
          Un puesto, un técnico: contratar a otro para el mismo sitio deja libre al que estaba.
        </p>
      </AppPanel>
    </div>

    <AppPanel :title="selected ? selected.roleLabel : 'Ficha del técnico'">
      <div v-if="selected" class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <AppAvatar kind="staff" :seed="selected.id" :name="selected.name" :size="64" />
          <p class="flex min-w-0 items-center gap-2 text-base font-bold">
            <AppFlag :code="selected.nationality" />
            <span class="truncate">{{ selected.name }}</span>
          </p>
        </div>
        <KeyValueList :items="facts">
          <template #value="{ item }">
            <template v-if="item.id === 'level'">
              {{ selected.levelLabel }}
              <AppStars :value="selected.level" :label="`Nivel: ${selected.levelLabel}`" />
            </template>
            <template v-else>{{ item.value }}</template>
          </template>
        </KeyValueList>
        <AppSectionTitle size="xs">Qué aporta</AppSectionTitle>
        <p class="text-sm font-semibold">{{ selected.effect }}</p>
        <p class="text-xs text-tv-muted">{{ selected.roleHint }}</p>
      </div>
      <AppEmpty v-else>Pulsa un técnico de la nómina o de los libres para ver su ficha.</AppEmpty>
      <p v-if="error" role="alert" class="mt-3 text-sm" :class="TONE_TEXT.bad">{{ error }}</p>
    </AppPanel>

    <PageActions>
      <AppButton
        variant="danger"
        :disabled="busy || !selectedMember"
        @click="selectedMember && fire(selectedMember)"
      >
        Despedir
      </AppButton>
      <AppButton
        variant="primary"
        :disabled="busy || !selectedCandidate || !staff.isManaged"
        @click="selectedCandidate && hire(selectedCandidate)"
      >
        Contratar
      </AppButton>
    </PageActions>
  </div>
</template>
