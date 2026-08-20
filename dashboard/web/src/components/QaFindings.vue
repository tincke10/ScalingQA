<script setup lang="ts">
import type { QaReport } from '../types'

defineProps<{ report: QaReport | null }>()
</script>

<template>
  <section class="panel">
    <h2>Hallazgos</h2>

    <p v-if="!report" class="muted">
      Todavía no hay informe. Corré <code>make qa-report</code>.
    </p>

    <template v-else>
      <p class="mono-small">
        {{ report.analyzed.e2e_runs }} corridas E2E · {{ report.analyzed.load_runs }} de carga ·
        {{ report.generated_at }}
      </p>

      <p v-if="!report.has_findings" class="clean">
        Sin hallazgos: ningún test flaky, ninguna falla nueva, ninguna regresión de latencia.
      </p>

      <template v-else>
        <div v-if="report.findings.new_failures.length" class="group">
          <h3 class="bad">Fallas nuevas</h3>
          <p class="mono-small">Tests que pasaban y empezaron a fallar. Son regresiones.</p>
          <ul>
            <li v-for="item in report.findings.new_failures" :key="item.title">
              {{ item.title }} <span class="mono-small">desde {{ item.since }}</span>
            </li>
          </ul>
        </div>

        <div v-if="report.findings.flaky.length" class="group">
          <h3 class="warn">Tests inestables</h3>
          <p class="mono-small">Mismo test con resultados distintos entre corridas.</p>
          <ul>
            <li v-for="item in report.findings.flaky" :key="item.title">
              {{ item.title }}
              <span class="mono-small">{{ item.passed }} verdes / {{ item.failed }} rojas</span>
            </li>
          </ul>
        </div>

        <div v-if="report.findings.latency_regressions.length" class="group">
          <h3 class="warn">Regresiones de latencia</h3>
          <p class="mono-small">p95 de la última corrida contra la mediana de las previas.</p>
          <ul>
            <li v-for="item in report.findings.latency_regressions" :key="item.scenario">
              {{ item.scenario }}
              <span class="mono-small">
                {{ item.baselineP95 }}ms → {{ item.currentP95 }}ms (+{{ item.deltaPct }}%)
              </span>
            </li>
          </ul>
        </div>
      </template>

      <div v-if="report.llm_suggestions" class="group">
        <h3>Sugerencias</h3>
        <pre>{{ report.llm_suggestions }}</pre>
      </div>
    </template>
  </section>
</template>

<style scoped>
h2 { margin: 0 0 8px; }
h3 { margin: 0 0 2px; font-size: 13px; }
.group { margin-top: 16px; }
.bad { color: var(--red); }
.warn { color: var(--amber); }
.clean { color: var(--green); }
ul { margin: 8px 0 0; padding-left: 18px; }
li { margin-bottom: 4px; }
pre { white-space: pre-wrap; color: var(--muted); margin: 8px 0 0; }
</style>
