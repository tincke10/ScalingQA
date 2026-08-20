import { describe, it, expect } from 'vitest'
import {
  parseContainers,
  healthFromStatus,
  demuxDockerLogs,
  inferProjectFromPort,
  detectCrashLoop,
} from '../parse'

/**
 * Los fixtures son la salida REAL de /containers/json contra los containers de prolicht.
 * `laravel.test` no declara healthcheck: Status viene sin sufijo. Ese es justo el caso que
 * hace que `docker compose --wait` dé por buena una app muerta.
 */
const laravelRaw = {
  Id: '3c95c92e4f1855b13b440994cb4b6baac4ab98557436e5fa1eb04f75a7faf2d1',
  Names: ['/prolicht-laravel.test-1'],
  Image: 'sail-8.3/app',
  State: 'running',
  Status: 'Up 15 hours',
  Ports: [
    { IP: '0.0.0.0', PrivatePort: 5173, PublicPort: 5173, Type: 'tcp' },
    { IP: '::', PrivatePort: 5173, PublicPort: 5173, Type: 'tcp' },
    { IP: '0.0.0.0', PrivatePort: 80, PublicPort: 80, Type: 'tcp' },
    { IP: '::', PrivatePort: 80, PublicPort: 80, Type: 'tcp' },
  ],
  Labels: {
    'com.docker.compose.project': 'prolicht',
    'com.docker.compose.service': 'laravel.test',
    'com.docker.compose.project.config_files':
      '/Users/tincho/Documents/Project/prolicht-wt/WEB-1293/compose.yaml',
  },
}

const mysqlRaw = {
  Id: 'aaaabbbbccccdddd',
  Names: ['/prolicht-mysql-1'],
  State: 'running',
  Status: 'Up 15 hours (healthy)',
  Ports: [{ IP: '0.0.0.0', PrivatePort: 3306, PublicPort: 3306, Type: 'tcp' }],
  Labels: {
    'com.docker.compose.project': 'prolicht',
    'com.docker.compose.service': 'mysql',
    'com.docker.compose.project.config_files': '/wt/WEB-1293/compose.yaml',
  },
}

describe('parseContainers', () => {
  it('extrae identidad de compose, estado y puertos publicados', () => {
    expect(parseContainers([laravelRaw])).toEqual([
      {
        id: '3c95c92e4f18',
        name: 'prolicht-laravel.test-1',
        image: 'sail-8.3/app',
        project: 'prolicht',
        service: 'laravel.test',
        compose_files: ['/Users/tincho/Documents/Project/prolicht-wt/WEB-1293/compose.yaml'],
        state: 'running',
        health: 'none-declared',
        published_ports: [80, 5173],
      },
    ])
  })

  it('deduplica los puertos que docker lista una vez por familia de IP', () => {
    expect(parseContainers([laravelRaw])[0].published_ports).toEqual([80, 5173])
  })

  it('parte config_files en varios cuando el target usa -f multiples veces', () => {
    const raw = {
      ...mysqlRaw,
      Labels: {
        ...mysqlRaw.Labels,
        'com.docker.compose.project.config_files': '/a/compose.yaml,/b/override.yaml',
      },
    }
    expect(parseContainers([raw])[0].compose_files).toEqual(['/a/compose.yaml', '/b/override.yaml'])
  })

  it('tolera containers que no levantó compose (sin labels)', () => {
    const raw = { Id: 'ff00', Names: ['/suelto'], State: 'running', Status: 'Up 1 hour', Ports: [], Labels: {} }
    expect(parseContainers([raw])[0]).toMatchObject({ project: null, service: null, compose_files: [], image: '' })
  })
})

describe('healthFromStatus', () => {
  it('lee el healthcheck cuando el target lo declara', () => {
    expect(healthFromStatus('Up 15 hours (healthy)')).toBe('healthy')
    expect(healthFromStatus('Up 2 minutes (unhealthy)')).toBe('unhealthy')
    expect(healthFromStatus('Up 5 seconds (health: starting)')).toBe('starting')
  })

  it('sin healthcheck declarado devuelve none-declared, que NO es un fallo', () => {
    expect(healthFromStatus('Up 15 hours')).toBe('none-declared')
    expect(healthFromStatus('Exited (1) 3 minutes ago')).toBe('none-declared')
  })
})

describe('demuxDockerLogs', () => {
  const frame = (stream: number, text: string) => {
    const payload = Buffer.from(text, 'utf8')
    const header = Buffer.alloc(8)
    header[0] = stream
    header.writeUInt32BE(payload.length, 4)
    return Buffer.concat([header, payload])
  }

  it('saca el framing de 8 bytes que el Engine mete cuando el container no tiene TTY', () => {
    const buf = Buffer.concat([frame(1, 'hola\n'), frame(2, 'error\n')])
    expect(demuxDockerLogs(buf)).toBe('hola\nerror\n')
  })

  it('devuelve el texto tal cual si el container corre con TTY (no hay framing)', () => {
    expect(demuxDockerLogs(Buffer.from('linea suelta\n', 'utf8'))).toBe('linea suelta\n')
  })
})

describe('inferProjectFromPort', () => {
  it('descubre el proyecto por el puerto de la URL, sin que el usuario configure nada', () => {
    const containers = parseContainers([laravelRaw, mysqlRaw])
    expect(inferProjectFromPort(containers, 80)).toBe('prolicht')
  })

  it('devuelve null si ningún container publica ese puerto', () => {
    expect(inferProjectFromPort(parseContainers([laravelRaw]), 9999)).toBeNull()
  })
})

describe('detectCrashLoop', () => {
  it('caza el crash loop real de prolicht: supervisord reintentando php hasta rendirse', () => {
    const logs = [
      "2026-08-19 20:05:55,224 INFO spawned: 'php' with pid 12",
      'Could not open input file: /var/www/html/artisan',
      '2026-08-19 20:05:55,459 WARN exited: php (exit status 1; not expected)',
      '2026-08-19 20:06:02,568 INFO gave up: php entered FATAL state, too many start retries too quickly',
    ].join('\n')

    expect(detectCrashLoop(logs)).toEqual({
      process: 'php',
      last_error: 'Could not open input file: /var/www/html/artisan',
    })
  })

  it('no inventa un crash loop en logs sanos', () => {
    expect(detectCrashLoop('INFO spawned: nginx\nlistening on :80\n')).toBeNull()
  })
})
