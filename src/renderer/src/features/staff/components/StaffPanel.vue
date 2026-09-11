<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { StaffMember, TeamStaff } from '@shared/contracts/staff.contract';
import { formatMoney } from '@renderer/shared/format';
import { AppButton, AppSectionTitle } from '@renderer/shared/ui';

const props = defineProps<{ teamId: string }>();

const staff = ref<TeamStaff | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
const roleFilter = ref<string>('');

const candidates = computed(() => {
  const all = staff.value?.candidates ?? [];
  return roleFilter.value ? all.filter((member) => member.role === roleFilter.value) : all;
});

onMounted(load);

async function load(): Promise<void> {
  staff.value = await window.api.staff.get(props.teamId);
}

async function run(action: () => Promise<TeamStaff>): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    staff.value = await action();
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
</script>

<template>
  <div v-if="staff" class="flex flex-col gap-5">
    <section class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between">
        <AppSectionTitle>En nómina</AppSectionTitle>
        <span class="text-sm text-court-300">
          {{ formatMoney(staff.monthlyWagesCents) }}/mes ·
          {{ formatMoney(staff.seasonWagesCents) }} al año
        </span>
      </div>

      <div class="overflow-auto rounded border border-court-700">
        <table class="data-table">
          <thead>
            <tr>
              <th>Puesto</th>
              <th>Técnico</th>
              <th>Nivel</th>
              <th>Qué aporta</th>
              <th class="numeric">Ficha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in staff.members" :key="member.id">
              <td class="text-ball-400">{{ member.roleLabel }}</td>
              <td>{{ member.name }}</td>
              <td class="text-court-300">{{ member.levelLabel }} ({{ member.level }})</td>
              <td class="text-court-300">{{ member.effect }}</td>
              <td class="numeric">{{ formatMoney(member.wageCents) }}</td>
              <td>
                <AppButton size="sm" :disabled="busy" @click="fire(member)"> Despedir </AppButton>
              </td>
            </tr>
            <tr v-for="vacancy in staff.vacancies" :key="vacancy.role">
              <td class="text-ball-400">{{ vacancy.roleLabel }}</td>
              <td colspan="4" class="text-court-600">Puesto vacante · {{ vacancy.roleHint }}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between">
        <AppSectionTitle>Técnicos libres</AppSectionTitle>
        <select
          v-model="roleFilter"
          class="rounded border border-court-600 bg-court-900 px-2 py-1 text-sm"
        >
          <option value="">Todos los puestos</option>
          <option v-for="vacancy in staff.vacancies" :key="vacancy.role" :value="vacancy.role">
            {{ vacancy.roleLabel }}
          </option>
        </select>
      </div>

      <div class="overflow-auto rounded border border-court-700">
        <table class="data-table">
          <thead>
            <tr>
              <th>Puesto</th>
              <th>Técnico</th>
              <th>Nivel</th>
              <th>Qué aporta</th>
              <th class="numeric">Ficha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="candidates.length === 0">
              <td colspan="6" class="text-court-300">No hay nadie libre para ese puesto.</td>
            </tr>
            <tr v-for="member in candidates" :key="member.id">
              <td class="text-court-300">{{ member.roleLabel }}</td>
              <td>{{ member.name }}</td>
              <td>{{ member.levelLabel }} ({{ member.level }})</td>
              <td class="text-court-300">{{ member.effect }}</td>
              <td class="numeric">{{ formatMoney(member.wageCents) }}</td>
              <td>
                <AppButton
                  variant="primary"
                  size="sm"
                  :disabled="busy || !staff.isManaged"
                  @click="hire(member)"
                >
                  Contratar
                </AppButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <span class="text-xs text-court-600">
        Un puesto, un técnico: contratar a otro para el mismo sitio deja libre al que estaba.
      </span>
    </section>

    <p v-if="error" class="text-sm text-bad-400">{{ error }}</p>
  </div>
</template>
