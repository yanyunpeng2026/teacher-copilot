import type { AppData } from './types'
import { initialData } from './data'

const KEY = 'zhixu_teacher_data_v1'

export function loadData(): AppData {
  const value = localStorage.getItem(KEY)
  if (!value) return initialData
  try {
    return JSON.parse(value) as AppData
  } catch {
    return initialData
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function exportData(data: AppData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `以昕数据备份-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
