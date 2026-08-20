<script setup lang="ts">
defineProps<{ status: string }>()

const LABEL: Record<string, string> = {
  passed: 'PASSED',
  failed: 'FAILED',
  unknown: 'UNKNOWN',
  ready: 'READY',
  not_ready: 'NOT READY',
}
</script>

<template>
  <span class="pill" :data-status="status">{{ LABEL[status] ?? status.toUpperCase() }}</span>
</template>

<style scoped>
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  border: 1px solid currentColor;
}
.pill[data-status='passed'],
.pill[data-status='ready'] { color: var(--green); }
.pill[data-status='failed'],
.pill[data-status='not_ready'] { color: var(--red); }
.pill[data-status='unknown'] { color: var(--amber); }
</style>
