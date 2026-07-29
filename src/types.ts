export type Student = {
  id: string
  classId: string
  name: string
  number: string
  gender: '男' | '女'
  phone: string
  guardian: string
  tags: string[]
  attendance: number
}

export type Todo = {
  id: string
  title: string
  date: string
  time: string
  priority: '紧急' | '重要' | '普通'
  done: boolean
  source: string
}

export type Material = {
  id: string
  name: string
  category: string
  path?: string
  storageKey?: string
  updated: string
  size: string
  starred: boolean
}

export type Task = {
  id: string
  kind?: '信息收集' | '图片收集' | '打卡任务' | '接龙报名' | '确认回执'
  title: string
  description: string
  due: string
  fields: string[]
  audience: string
  created: string
  completed: number
  total: number
}

export type Feedback = {
  id: string
  taskId: string
  student: string
  studentNo: string
  submitted: string
  values: Record<string, string>
}

export type SchoolClass = {
  id: string
  name: string
  role: string
  subject: string
  studentCount: number
  room: string
  next: string
}

export type TeacherProfile = {
  name: string
  school: string
  title: string
  subject: string
  phone: string
  motto: string
}

export type AppData = {
  students: Student[]
  todos: Todo[]
  materials: Material[]
  tasks: Task[]
  feedback: Feedback[]
  classes: SchoolClass[]
  profile: TeacherProfile
  directories: string[]
}
