export type Student = {
  id: string
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
  updated: string
  size: string
  starred: boolean
}

export type Task = {
  id: string
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

export type AppData = {
  students: Student[]
  todos: Todo[]
  materials: Material[]
  tasks: Task[]
  feedback: Feedback[]
}
