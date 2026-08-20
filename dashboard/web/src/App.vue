<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchPreflight, fetchQaReport, fetchRuns, fetchTargets } from './api'
import type { PreflightReport, QaReport, RunSummary } from './types'
import PreflightCard from './components/PreflightCard.vue'
import RunsTable from './components/RunsTable.vue'
import QaFindings from './components/QaFindings.vue'

// Contenedor: acá vive el estado y las llamadas; los componentes de abajo solo presentan.
const runs = ref<RunSummary[]>([])
const qaReport = ref<QaReport | null>(null)
const targets = ref<string[]>([])
const selectedTarget = ref('')
const preflight = ref<PreflightReport | null>(null)
const preflightLoading = ref(false)
const preflightError = ref<string | null>(null)
const filter = ref('todos')

const loadHistory = async () => {
  const [loadedRuns, report] = await Promise.all([fetchRuns(), fetchQaReport()])
  runs.value = loadedRuns
  qaReport.value = report
}

const checkPreflight = async () => {
  if (!selectedTarget.value) return
  preflightLoading.value = true
  preflightError.value = null

  try {
    preflight.value = await fetchPreflight(selectedTarget.value)
    // La consulta en vivo NO deja artefacto (artifacts va montado read-only): la corrida
    // que queda registrada es `make preflight`. Igual se refresca por si hubo otras.
    await loadHistory()
  } catch (error) {
    preflightError.value = (error as Error).message
  } finally {
    preflightLoading.value = false
  }
}

onMounted(async () => {
  targets.value = await fetchTargets()
  selectedTarget.value = targets.value[0] ?? ''
  await loadHistory()
})
</script>

<template>
  <main>
    <header class="top">
      <h1>ScalingQA</h1>
      <span class="muted">estado de los targets y de las corridas</span>
    </header>

    <PreflightCard
      :targets="targets"
      :selected="selectedTarget"
      :report="preflight"
      :loading="preflightLoading"
      :error="preflightError"
      @update:selected="selectedTarget = $event"
      @check="checkPreflight"
    />

    <QaFindings :report="qaReport" />

    <RunsTable :runs="runs" :filter="filter" @update:filter="filter = $event" />
  </main>
</template>

<style scoped>
main {
  max-width: 1000px;
  margin: 0 auto;
  padding: 32px 24px 64px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.top { display: flex; align-items: baseline; gap: 12px; }
h1 { margin: 0; font-size: 20px; }
</style>
