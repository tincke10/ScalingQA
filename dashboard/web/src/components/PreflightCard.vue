<script setup lang="ts">
import { ref } from 'vue'
import type { PreflightReport } from '../types'
import { parseHint, stackLabel } from '../format'
import StatusPill from './StatusPill.vue'

const copied = ref<string | null>(null)

async function copy(command: string) {
  await navigator.clipboard?.writeText(command)
  copied.value = command
  setTimeout(() => (copied.value = null), 1500)
}

defineProps<{
  targets: string[]
  selected: string
  report: PreflightReport | null
  loading: boolean
  error: string | null
}>()

defineEmits<{ (e: 'update:selected', value: string): void; (e: 'check'): void }>()
</script>

<template>
  <section class="panel">
    <header>
      <h2>Preflight</h2>
      <div class="controls">
        <select
          :value="selected"
          @change="$emit('update:selected', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="target in targets" :key="target" :value="target">{{ target }}</option>
        </select>
        <button :disabled="loading" @click="$emit('check')">
          {{ loading ? 'consultando…' : 'consultar ahora' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <p v-else-if="!report" class="muted">
      El estado no está cacheado: se pregunta en el momento. Dale a «consultar ahora».
    </p>

    <div v-else class="body">
      <div class="verdict">
        <StatusPill :status="report.verdict" />
        <span class="mono-small">{{ report.checked_at }}</span>
      </div>

      <dl>
        <dt>URL</dt>
        <dd>
          {{ report.probe.url }} —
          <template v-if="report.probe.status !== null">
            HTTP {{ report.probe.status }} en {{ report.probe.latency_ms }}ms
          </template>
          <template v-else>{{ report.probe.error }}</template>
        </dd>

        <dt>Stack</dt>
        <dd>{{ stackLabel(report.stack) }}</dd>

        <dt>Runtime</dt>
        <dd v-if="report.runtime.mode === 'none'" class="muted">
          sin visibilidad — {{ report.runtime.unreachable_reason }}
        </dd>
        <dd v-else>
          {{ report.runtime.host }} · proyecto <strong>{{ report.runtime.project ?? '—' }}</strong>
          <div v-for="file in report.runtime.compose_files" :key="file" class="mono-small">compose: {{ file }}</div>
        </dd>
      </dl>

      <table v-if="report.runtime.containers.length">
        <thead>
          <tr><th>servicio</th><th>estado</th><th>health</th><th>puertos</th></tr>
        </thead>
        <tbody>
          <tr v-for="container in report.runtime.containers" :key="container.name">
            <td>{{ container.service ?? container.name }}</td>
            <td>{{ container.state }}</td>
            <td :class="{ warn: container.health === 'unhealthy' }">{{ container.health }}</td>
            <td>{{ container.published_ports.join(', ') || '—' }}</td>
          </tr>
        </tbody>
      </table>

      <div v-for="item in report.diagnosis" :key="item.code" class="diagnosis">
        <p><code>{{ item.code }}</code> {{ item.message }}</p>

        <ol v-if="item.hints.length" class="hints">
          <li v-for="(raw, i) in item.hints" :key="i">
            <template v-if="parseHint(raw).kind === 'command'">
              <code class="cmd">{{ parseHint(raw).text }}</code>
              <button class="copy" @click="copy(parseHint(raw).text)">
                {{ copied === parseHint(raw).text ? 'copiado' : 'copiar' }}
              </button>
            </template>
            <span v-else>{{ parseHint(raw).text }}</span>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
h2 { margin: 0; }
.controls { display: flex; gap: 8px; }
select, button {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 6px 10px;
  font: inherit;
  cursor: pointer;
}
button:disabled { opacity: 0.5; cursor: default; }
.verdict { display: flex; align-items: center; gap: 10px; margin: 16px 0 12px; }
dl { display: grid; grid-template-columns: 90px 1fr; gap: 6px 12px; margin: 0 0 16px; }
dt { color: var(--muted); }
dd { margin: 0; word-break: break-all; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; }
th, td { padding: 4px 8px 4px 0; border-bottom: 1px solid var(--line); }
.warn { color: var(--amber); }
.diagnosis { margin: 6px 0; }
.diagnosis p { margin: 0; }
.diagnosis p > code { color: var(--accent); margin-right: 6px; }
.hints { margin: 8px 0 12px; padding-left: 22px; color: var(--muted); }
.hints li { margin: 4px 0; }
.hints li::marker { color: var(--muted); }
.cmd {
  display: inline-block;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 2px 8px;
  user-select: all;
}
.copy {
  margin-left: 8px;
  padding: 1px 8px;
  font-size: 12px;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 4px;
  cursor: pointer;
}
.copy:hover { color: var(--text); }
.error { color: var(--red); }
</style>
