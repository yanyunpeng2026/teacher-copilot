import type { AppData } from './types'
import { initialData } from './data'

const KEY = 'zhixu_teacher_data_v1'

export function loadData(): AppData {
  const value = localStorage.getItem(KEY)
  if (!value) return initialData
  try {
    const parsed = JSON.parse(value) as Partial<AppData>
    return {
      ...initialData,
      ...parsed,
      classes: parsed.classes?.length ? parsed.classes : initialData.classes,
      profile: { ...initialData.profile, ...parsed.profile },
      directories: parsed.directories?.length ? parsed.directories : initialData.directories
    }
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
  a.download = `知昕数据备份-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
