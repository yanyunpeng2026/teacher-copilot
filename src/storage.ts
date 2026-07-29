import type { AppData } from './types'
import { initialData } from './data'

const KEY = 'zhixu_teacher_data_v1'

export function normalizeData(value: Partial<AppData>, fallback: AppData = initialData): AppData {
  const classes = value.classes?.length ? value.classes : fallback.classes
  const defaultClassId = classes[0]?.id || initialData.classes[0].id
  const students = (value.students ?? fallback.students).map(student => ({
    ...student,
    classId: student.classId && classes.some(item => item.id === student.classId) ? student.classId : defaultClassId
  }))
  return {
    ...fallback,
    ...value,
    students,
    classes,
    profile: { ...fallback.profile, ...value.profile },
    directories: value.directories?.length ? value.directories : fallback.directories
  }
}

export function loadData(): AppData {
  const value = localStorage.getItem(KEY)
  if (!value) return initialData
  try {
    const parsed = JSON.parse(value) as Partial<AppData>
    return normalizeData(parsed)
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
