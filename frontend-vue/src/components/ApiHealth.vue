<script setup lang="ts">
import { onMounted, ref } from 'vue'

const status = ref<'loading' | 'ok' | 'error'>('loading')
const appName = ref('')

const apiUrl: string = import.meta.env.VITE_API_URL ?? ''

onMounted(async () => {
  try {
    const res = await fetch(`${apiUrl}/api/health`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    status.value = data.status === 'ok' ? 'ok' : 'error'
    appName.value = data.app ?? ''
  } catch {
    status.value = 'error'
  }
})
</script>

<template>
  <div class="api-health">
    <p data-testid="status">API: {{ status }}</p>
    <p v-if="appName" data-testid="app-name">{{ appName }}</p>
  </div>
</template>
