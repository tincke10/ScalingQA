<script setup lang="ts">
import { computed } from 'vue'
import type { RunSummary } from '../types'
import { formatDetail, relativeTime, runLabel } from '../format'
import StatusPill from './StatusPill.vue'

const props = defineProps<{ runs: RunSummary[]; filter: string }>()
defineEmits<{ (e: 'update:filter', value: string): void }>()

const TYPES = ['todos', 'preflight', 'e2e', 'load', 'sweep']

const visible = computed(() =>
  props.filter === 'todos' ? props.runs : props.runs.filter((run) => run.run_type === props.filter),
)
</script>

<template>
  <section class="panel">
    <header>
      <h2>Historial <span class="muted">({{ visible.length }})</span></h2>
      <nav>
        <button
          v-for="type in TYPES"
          :key="type"
          :class="{ active: filter === type }"
          @click="$emit('update:filter', type)"
        >
          {{ type }}
        </button>
      </nav>
    </header>

    <p v-if="!visible.length" class="muted">
      No hay corridas de este tipo todavía. Corré <code>make test-e2e</code>, <code>make test-load</code>
      o <code>make preflight</code>.
    </p>

    <table v-else>
      <thead>
        <tr><th>tipo</th><th>estado</th><th>cuándo</th><th>sha</th><th>detalle</th></tr>
      </thead>
      <tbody>
        <tr v-for="run in visible" :key="`${run.run_type}-${run.run_id}`">
          <td><span class="type">{{ run.run_type }}</span></td>
          <td><StatusPill :status="run.status" /></td>
          <td>
            {{ relativeTime(run.timestamp) }}
            <div class="mono-small">{{ runLabel(run.run_id).when }}</div>
          </td>
          <td><code>{{ run.git_sha }}</code></td>
          <td>{{ formatDetail(run.run_type, run.detail) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
h2 { margin: 0; }
nav { display: flex; gap: 4px; }
nav button {
  background: transparent;
  color: var(--muted);
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 4px 10px;
  font: inherit;
  cursor: pointer;
}
nav button.active { color: var(--text); border-color: var(--line); background: var(--bg); }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; }
th, td { padding: 8px 12px 8px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
.type { color: var(--accent); }
code { color: var(--muted); }
</style>
