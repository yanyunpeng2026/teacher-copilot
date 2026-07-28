import type { Feedback, Task } from './types'

export type SyncState = {
  connected: boolean
  origin: string
  address: string
}

async function request<T>(url: string, init?: RequestInit, timeout = 2500): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) throw new Error(String(response.status))
    return await response.json() as T
  } finally {
    clearTimeout(timer)
  }
}

export async function detectSync(): Promise<SyncState> {
  try {
    const result = await request<{ origin: string; address: string }>('/api/health')
    return { connected: true, origin: result.origin, address: result.address }
  } catch {
    return { connected: false, origin: '', address: '' }
  }
}

export async function publishTask(task: Task) {
  return request<{ ok: boolean; url: string }>('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task })
  })
}

export async function fetchTask(id: string) {
  return request<{ task: Task }>(`/api/tasks/${encodeURIComponent(id)}`)
}

export async function submitFeedback(feedback: Feedback) {
  return request<{ ok: boolean }>('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback })
  }, 5000)
}

export async function fetchFeedback() {
  return request<{ feedback: Feedback[] }>('/api/feedback')
}

export function subscribeFeedback(onFeedback: (feedback: Feedback) => void) {
  const source = new EventSource('/api/events')
  source.onmessage = event => {
    const value = JSON.parse(event.data)
    if (value.type === 'feedback') onFeedback(value.feedback)
  }
  return () => source.close()
}
