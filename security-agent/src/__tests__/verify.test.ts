import { describe, it, expect } from 'vitest'
import { interpretResults } from '../verify'

// En la semántica invertida de Capa 3: spec PASSED = explotación reproducida = vuln real.
const results = {
  suites: [
    {
      specs: [
        {
          title: 'idor exploit',
          file: 'generated/idor-task-show.spec.ts',
          ok: true,
          tests: [{ results: [{ status: 'passed' }] }],
        },
        {
          title: 'mass assignment attempt',
          file: 'generated/mass-assignment-create-task.spec.ts',
          ok: false,
          tests: [{ results: [{ status: 'failed' }] }],
        },
      ],
    },
  ],
}

describe('interpretResults', () => {
  it('marca como vulnerabilidad los specs que PASARON (explotación reproducida)', () => {
    const { confirmed, defended } = interpretResults(results)

    expect(confirmed.map((c) => c.file)).toEqual(['generated/idor-task-show.spec.ts'])
    expect(defended.map((d) => d.file)).toEqual(['generated/mass-assignment-create-task.spec.ts'])
  })

  it('extrae clase y workflow del nombre del archivo', () => {
    const { confirmed } = interpretResults(results)
    expect(confirmed[0].vulnClass).toBe('idor')
    expect(confirmed[0].workflow).toBe('task-show')
  })

  it('no confirma nada cuando todos los specs fallan (app segura)', () => {
    const safe = {
      suites: [
        { specs: [{ title: 'x', file: 'generated/idor-x.spec.ts', ok: false, tests: [{ results: [{ status: 'failed' }] }] }] },
      ],
    }
    expect(interpretResults(safe).confirmed).toEqual([])
  })
})
