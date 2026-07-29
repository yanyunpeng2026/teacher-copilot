import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser'
import {
  Archive, Award, Bell, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown,
  CircleUserRound, ClipboardCheck, Clock3, Download, FileArchive, FileText,
  FolderOpen, GraduationCap, LayoutDashboard, ListTodo, Menu, MoreHorizontal,
  Mic, Plus, QrCode, ScanLine, Search, Settings, ShieldCheck, Sparkles, Star,
  Upload, UserPlus, Users, Volume2, WandSparkles, X
} from 'lucide-react'
import type { AppData, Feedback, SchoolClass, Student, Task, TeacherProfile, Todo } from './types'
import { exportData, loadData, normalizeData, saveData } from './storage'
import { detectSync, fetchFeedback, fetchTask, publishTask, submitFeedback, subscribeFeedback, type SyncState } from './sync'
import { storeLocalFile } from './fileStore'

type Page = 'home' | 'class' | 'todos' | 'tasks' | 'materials' | 'career' | 'documents'
type Toast = { text: string; kind?: 'ok' | 'info' }

const nav = [
  { id: 'home', label: '工作台', icon: LayoutDashboard },
  { id: 'class', label: '班级与学生', icon: Users },
  { id: 'todos', label: '待办与日程', icon: ListTodo },
  { id: 'tasks', label: '发布中心', icon: QrCode },
  { id: 'materials', label: '资料文档库', icon: FolderOpen },
  { id: 'career', label: '职称助手', icon: Award },
  { id: 'documents', label: '文档工具', icon: FileText }
] as const

function uid(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function encodeTask(task: Task) {
  const raw = JSON.stringify({ v: 1, type: 'zhixu-task', task })
  return btoa(unescape(encodeURIComponent(raw)))
}

function decodePayload(value: string) {
  return JSON.parse(decodeURIComponent(escape(atob(value))))
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} onMouseDown={e => e.stopPropagation()}>
        <header><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X size={20} /></button></header>
        {children}
      </section>
    </div>
  )
}

function Ring({ value, label }: { value: number; label: string }) {
  return <div className="ring" style={{ '--value': `${value * 3.6}deg` } as React.CSSProperties}><div><b>{value}%</b><span>{label}</span></div></div>
}

function Empty({ icon: Icon, title, text }: { icon: typeof Archive; title: string; text: string }) {
  return <div className="empty"><Icon size={32} /><b>{title}</b><span>{text}</span></div>
}

function ReminderCenter({ data, onClose, onNavigate }: { data: AppData; onClose: () => void; onNavigate: (page: Page) => void }) {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const todos = data.todos.filter(todo => !todo.done).slice(0, 4).map(todo => {
    const [hour, minute] = todo.time.split(':').map(Number)
    const overdue = todo.date === '今天' && hour * 60 + minute < minutes
    return {
      id: todo.id,
      Icon: Clock3,
      tone: overdue ? 'urgent' : todo.priority === '紧急' ? 'important' : 'normal',
      label: overdue ? '已超时' : todo.priority,
      title: todo.title,
      text: `${todo.date} ${todo.time} · ${todo.source}`,
      page: 'todos' as Page
    }
  })
  const tasks = data.tasks.filter(task => task.completed < task.total).slice(0, 3).map(task => ({
    id: task.id,
    Icon: ClipboardCheck,
    tone: 'task',
    label: '待回收',
    title: task.title,
    text: `还差 ${task.total - task.completed} 人 · 截止 ${task.due}`,
    page: 'tasks' as Page
  }))
  const items = [...todos, ...tasks]
  return <Modal title="提醒中心" onClose={onClose}><div className="reminder-center">
    <div className="reminder-summary"><span><Bell size={21} /></span><div><b>{items.length ? `还有 ${items.length} 件事需要留意` : '目前没有待处理提醒'}</b><p>{items.length ? '小昕已经按紧急程度整理好，点开即可查看。' : '可以安心休息一会儿，有新事项时会显示在这里。'}</p></div></div>
    <div className="reminder-list">
      {items.map(item => <button key={`${item.page}-${item.id}`} onClick={() => { onNavigate(item.page); onClose() }}><span className={`reminder-icon ${item.tone}`}><item.Icon size={18} /></span><div><em>{item.label}</em><b>{item.title}</b><small>{item.text}</small></div><span className="reminder-open">›</span></button>)}
      {!items.length && <Empty icon={CheckCircle2} title="今天很从容" text="暂时没有需要处理的提醒" />}
    </div>
    <div className="care-reminder"><span>🌿</span><div><b>小昕关怀提醒</b><p>喝几口水，活动一下肩颈，再继续也不迟。</p></div></div>
  </div></Modal>
}

function formatToday(date: Date) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${date.getMonth() + 1}月${date.getDate()}日 · 星期${weekdays[date.getDay()]}`
}

function greetingFor(date: Date) {
  const hour = date.getHours()
  if (hour < 6) return { text: '夜深了', icon: '🌙' }
  if (hour < 9) return { text: '早上好', icon: '🌤️' }
  if (hour < 12) return { text: '上午好', icon: '☀' }
  if (hour < 14) return { text: '中午好', icon: '🌿' }
  if (hour < 18) return { text: '下午好', icon: '☀' }
  return { text: '晚上好', icon: '🌙' }
}

function StudentTask() {
  const [payload, setPayload] = useState<{ task: Task } | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [identity, setIdentity] = useState({ student: '', studentNo: '' })
  const [resultQr, setResultQr] = useState('')
  const [syncComplete, setSyncComplete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams(location.hash.split('?')[1])
      const taskId = params.get('task')
      const value = params.get('data')
      try {
        if (taskId) {
          const result = await fetchTask(taskId)
          setPayload({ task: result.task })
        } else if (value) {
          setPayload(decodePayload(value))
        } else {
          throw new Error()
        }
      } catch {
        setError('任务暂时无法读取。请确认手机与老师电脑连接同一 Wi‑Fi。')
      }
    }
    load()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!payload || !identity.student.trim() || !identity.studentNo.trim()) return
    const feedback: Feedback = {
      id: uid('f'), taskId: payload.task.id, student: identity.student.trim(),
      studentNo: identity.studentNo.trim(), submitted: new Date().toLocaleString('zh-CN'),
      values
    }
    try {
      await submitFeedback(feedback)
      setSyncComplete(true)
    } catch {
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, type: 'zhixu-feedback', feedback }))))
      setResultQr(await QRCode.toDataURL(encoded, { width: 340, margin: 2, color: { dark: '#173f36', light: '#ffffff' } }))
    }
  }

  function selectImage(field: string, file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
        setValues(current => ({ ...current, [field]: canvas.toDataURL('image/jpeg', .78) }))
      }
      image.onerror = () => setValues(current => ({ ...current, [field]: String(reader.result) }))
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  if (error) return <div className="student-shell"><div className="student-card"><h1>无法打开任务</h1><p>{error}</p></div></div>
  if (!payload) return <div className="student-shell"><div className="student-card">正在读取任务…</div></div>
  const task = payload.task
  return (
    <div className="student-shell">
      <div className="student-brand"><span className="logo-mark"><BookOpen size={22} /></span><b>知昕</b><em>学生任务</em></div>
      <main className="student-card">
        {syncComplete ? (
          <div className="result-card">
            <span className="success-icon pulse-success"><Check size={34} /></span>
            <h1>已自动提交</h1>
            <p>反馈已同步至老师的知昕工作台，无需再出示二维码。</p>
            <div className="sync-receipt"><CheckCircle2 size={20} /><div><b>老师端已接收</b><span>{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></div></div>
            <div className="privacy-note"><ShieldCheck size={17} />仅在校园局域网内传输 · 未上传云端</div>
          </div>
        ) : resultQr ? (
          <div className="result-card">
            <span className="success-icon"><Check size={34} /></span>
            <h1>填写完成</h1>
            <p>当前无法连接老师电脑，请将下方备用反馈码出示给老师扫描。</p>
            <img src={resultQr} alt="反馈二维码" />
            <div className="privacy-note"><ShieldCheck size={17} />未上传云端 · 关闭页面后内容自动清除</div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="task-kicker">{task.audience} · 截止 {task.due}</div>
            <h1>{task.title}</h1>
            <p className="task-desc">{task.description}</p>
            <div className="form-grid">
              <label>姓名<input required value={identity.student} onChange={e => setIdentity({ ...identity, student: e.target.value })} placeholder="请输入姓名" /></label>
              <label>学号<input required value={identity.studentNo} onChange={e => setIdentity({ ...identity, studentNo: e.target.value })} placeholder="请输入学号" inputMode="numeric" /></label>
            </div>
            {task.fields.map((field, i) => (
              <label key={field}>{i + 1}. {field}{field.includes('图片') || field.includes('照片') ? <><input required type="file" accept="image/*" capture="environment" onChange={event => selectImage(field, event.target.files?.[0])} />{values[field] && <span className="image-ready"><Check size={14} />图片已准备，提交后自动同步</span>}</> : <input required value={values[field] || ''} onChange={e => setValues({ ...values, [field]: e.target.value })} placeholder={`请填写${field}`} />}</label>
            ))}
            <button className="primary submit-btn" type="submit"><CheckCircle2 size={18} />提交给老师</button>
          </form>
        )}
      </main>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<AppData>(loadData)
  const [page, setPage] = useState<Page>('home')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [modal, setModal] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [qrUrl, setQrUrl] = useState('')
  const [sidebar, setSidebar] = useState(false)
  const [sync, setSync] = useState<SyncState>({ connected: false, origin: '', address: '' })
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [teacherMenu, setTeacherMenu] = useState(false)
  const [activeClassId, setActiveClassId] = useState(() => localStorage.getItem('zhixin_active_class') || 'c1')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => saveData(data), [data])
  useEffect(() => localStorage.setItem('zhixin_active_class', activeClassId), [activeClassId])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        setVoiceOpen(true)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  useEffect(() => {
    let stop = () => {}
    detectSync().then(async state => {
      setSync(state)
      if (!state.connected) return
      const ingest = (feedback: Feedback) => setData(current => {
        if (current.feedback.some(item => item.id === feedback.id)) return current
        return {
          ...current,
          feedback: [feedback, ...current.feedback],
          tasks: current.tasks.map(task => task.id === feedback.taskId ? { ...task, completed: Math.min(task.total, task.completed + 1) } : task)
        }
      })
      try {
        const existing = await fetchFeedback()
        existing.feedback.slice().reverse().forEach(ingest)
      } catch {
        setSync({ connected: false, origin: '', address: '' })
        return
      }
      stop = subscribeFeedback(ingest)
    })
    return () => stop()
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  if (location.hash.startsWith('#/student')) return <StudentTask />

  const todayDone = data.todos.filter(t => t.done).length
  const activeClass = data.classes.find(item => item.id === activeClassId) || data.classes[0]
  const classStudents = data.students.filter(student => student.classId === activeClass?.id)
  const filteredStudents = classStudents.filter(student => `${student.name}${student.number}${student.tags.join('')}`.includes(search))
  const reminderCount = data.todos.filter(todo => !todo.done).length + data.tasks.filter(task => task.completed < task.total).length

  function updateTodo(id: string) {
    setData(d => ({ ...d, todos: d.todos.map(t => t.id === id ? { ...t, done: !t.done } : t) }))
  }

  async function showTaskQr(task: Task) {
    let url = `${location.origin}${location.pathname}#/student?data=${encodeURIComponent(encodeTask(task))}`
    if (sync.connected) {
      try {
        const result = await publishTask(task)
        url = result.url
      } catch {
        setSync({ connected: false, origin: '', address: '' })
      }
    }
    setSelectedTask(task)
    setQrUrl(await QRCode.toDataURL(url, { width: 420, margin: 2, color: { dark: '#173f36', light: '#ffffff' }, errorCorrectionLevel: 'M' }))
    setModal('task-qr')
  }

  function importBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppData
        if (!parsed.students || !parsed.todos || !parsed.tasks) throw new Error()
        setData(current => normalizeData(parsed, current))
        setToast({ text: '本地备份已恢复', kind: 'ok' })
      } catch {
        setToast({ text: '文件格式无法识别' })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const title = page === 'home' ? '知昕' : nav.find(n => n.id === page)?.label || '工作台'
  return (
    <div className={`app page-${page}`}>
      <aside className={sidebar ? 'sidebar open' : 'sidebar'}>
        <div className="brand"><span className="logo-mark"><BookOpen size={22} /></span><div><b>知昕</b><small>教师工作台</small></div><button aria-label="关闭菜单" className="sidebar-close" onClick={() => setSidebar(false)}><X /></button></div>
        <div className="teacher-switcher">
          <button className={`teacher-mini ${teacherMenu ? 'open' : ''}`} onClick={() => setTeacherMenu(value => !value)}>
            <div className="avatar">{data.profile.name.slice(0, 1)}</div><div><b>{data.profile.name}</b><span>{activeClass?.name || '暂未选择班级'} · {activeClass?.role || data.profile.title}</span></div><ChevronDown size={16} />
          </button>
          {teacherMenu && <div className="teacher-dropdown">
            <header><span>切换工作班级</span><small>{data.profile.school}</small></header>
            {data.classes.map(item => <button className={item.id === activeClass?.id ? 'active' : ''} key={item.id} onClick={() => { setActiveClassId(item.id); setTeacherMenu(false) }}><span>{item.name.match(/\d+/g)?.slice(-1)[0] || '班'}</span><div><b>{item.name}</b><small>{item.subject} · {item.role}</small></div>{item.id === activeClass?.id && <Check size={15} />}</button>)}
            <footer><button onClick={() => { setTeacherMenu(false); setModal('new-class') }}><Plus size={16} />添加班级</button><button onClick={() => { setTeacherMenu(false); setModal('profile') }}><CircleUserRound size={16} />个人信息设置</button></footer>
          </div>}
        </div>
        <nav>
          <span className="nav-label">工作空间</span>
          {nav.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => { setPage(item.id); setSidebar(false) }}><item.icon size={19} /><span>{item.label}</span>{item.id === 'todos' && <em>{data.todos.filter(t => !t.done).length}</em>}</button>)}
        </nav>
        <div className="side-bottom">
          <div className="local-card"><ShieldCheck size={20} /><div><b>本地数据保护</b><span>所有资料仅保存在此设备</span></div></div>
          <button onClick={() => setModal('settings')}><Settings size={18} />设置与备份</button>
        </div>
      </aside>
      <div className="sidebar-scrim" onClick={() => { setSidebar(false); setTeacherMenu(false) }} />
      <main className="main">
        <header className="topbar">
          <button aria-label="打开菜单" className="menu-btn" onClick={() => setSidebar(true)}><Menu /></button>
          <div><span className="eyebrow">2026年7月28日 · 星期二</span><h1>{title}</h1></div>
          <div className="top-actions">
            <div className={`sync-chip ${sync.connected ? 'online' : ''}`}><i />{sync.connected ? '局域网同步中' : '单机模式'}</div>
            <label className="search"><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索学生、材料或待办" /></label>
            <button aria-label="问小昕" className="voice-trigger" onClick={() => setVoiceOpen(true)}><Mic size={18} /><span>问小昕</span><kbd>Ctrl ⇧ X</kbd></button>
            <button aria-label={`提醒中心，${reminderCount}条提醒`} className="icon-btn alert" onClick={() => setModal('reminders')}><Bell size={20} />{reminderCount > 0 && <i />}</button>
            <button className="primary" onClick={() => setModal('quick')}><Plus size={18} />快速新建</button>
          </div>
        </header>

        <div className="content">
          {page === 'home' && <>
            <div className="desktop-home"><Home data={data} studentTotal={classStudents.length} activeClassName={activeClass?.name || '当前班级'} setPage={setPage} updateTodo={updateTodo} onQr={() => setModal('new-task')} /></div>
            <div className="mobile-home"><MobileHome data={data} activeClassId={activeClass?.id || ''} setPage={setPage} onQr={() => setModal('new-task')} onVoice={() => setVoiceOpen(true)} onTodo={() => setModal('new-todo')} onAddClass={() => setModal('new-class')} /></div>
          </>}
          {page === 'class' && <Classroom students={filteredStudents} classes={data.classes} activeClassId={activeClass?.id || ''} hasSearch={Boolean(search)} onClassChange={setActiveClassId} onAddClass={() => setModal('new-class')} onEditClass={() => setModal('edit-class')} onEditStudent={student => { setSelectedStudent(student); setModal('edit-student') }} onAdd={() => setModal('new-student')} onImport={() => setModal('import-students')} />}
          {page === 'todos' && <Todos data={data} updateTodo={updateTodo} onAdd={() => setModal('new-todo')} />}
          {page === 'tasks' && <Tasks data={data} onNew={() => setModal('new-task')} onQr={showTaskQr} onScan={() => setModal('feedback')} />}
          {page === 'materials' && <Materials data={data} setData={setData} />}
          {page === 'career' && <Career />}
          {page === 'documents' && <Documents notify={text => setToast({ text, kind: 'ok' })} />}
        </div>
      </main>
      <nav className="mobile-bottom-nav" aria-label="手机端主导航">
        {([
          ['home', '首页', LayoutDashboard],
          ['class', '班级', Users],
          ['tasks', '任务', QrCode],
          ['todos', '待办', ListTodo]
        ] as const).map(([id, label, Icon]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={21} /><span>{label}</span>{id === 'todos' && data.todos.some(todo => !todo.done) && <i />}</button>)}
        <button onClick={() => setSidebar(true)}><Menu size={21} /><span>更多</span></button>
      </nav>
      {toast && <div className={`toast ${toast.kind || ''}`}><CheckCircle2 size={18} />{toast.text}</div>}
      <button className="voice-fab" aria-label="问小昕语音助手" onClick={() => setVoiceOpen(true)}><Mic size={22} /></button>
      {voiceOpen && <VoiceAssistant todos={data.todos} total={activeClass?.studentCount || classStudents.length} audience={activeClass?.name || '当前班级'} onClose={() => setVoiceOpen(false)} onPublish={task => { setData(current => ({ ...current, tasks: [task, ...current.tasks] })); setVoiceOpen(false); showTaskQr(task) }} />}

      {modal === 'quick' && <Modal title="快速新建" onClose={() => setModal(null)}><div className="quick-grid">
        {[['新建待办', ListTodo, 'new-todo'], ['发布扫码任务', QrCode, 'new-task'], ['添加班级', Users, 'new-class'], ['上传资料文档', Upload, 'go-materials']].map(([label, Icon, key]) => <button key={String(key)} onClick={() => { if (key === 'go-materials') { setPage('materials'); setModal(null) } else setModal(String(key)) }}><Icon size={24} /><b>{String(label)}</b><span>立即开始</span></button>)}
      </div></Modal>}

      {modal === 'new-todo' && <NewTodo onClose={() => setModal(null)} onSave={todo => { setData(d => ({ ...d, todos: [todo, ...d.todos] })); setModal(null); setToast({ text: '待办已添加', kind: 'ok' }) }} />}
      {modal === 'new-student' && activeClass && <NewStudent classId={activeClass.id} onClose={() => setModal(null)} onSave={student => { setData(d => ({ ...d, students: [...d.students, student] })); setModal(null); setToast({ text: `学生已加入${activeClass.name}`, kind: 'ok' }) }} />}
      {modal === 'edit-student' && selectedStudent && <NewStudent classId={selectedStudent.classId} initial={selectedStudent} onClose={() => setModal(null)} onSave={student => { setData(d => ({ ...d, students: d.students.map(item => item.id === student.id ? student : item) })); setSelectedStudent(null); setModal(null); setToast({ text: `${student.name}的信息已更新`, kind: 'ok' }) }} />}
      {modal === 'new-class' && <NewClass onClose={() => setModal(null)} onSave={schoolClass => { setData(d => ({ ...d, classes: [...d.classes, schoolClass] })); setActiveClassId(schoolClass.id); setModal(null); setToast({ text: `${schoolClass.name}已添加`, kind: 'ok' }) }} />}
      {modal === 'edit-class' && activeClass && <NewClass initial={activeClass} onClose={() => setModal(null)} onSave={schoolClass => { setData(d => ({ ...d, classes: d.classes.map(item => item.id === schoolClass.id ? schoolClass : item) })); setModal(null); setToast({ text: `${schoolClass.name}信息已更新`, kind: 'ok' }) }} />}
      {modal === 'profile' && <ProfileSettings profile={data.profile} onClose={() => setModal(null)} onSave={profile => { setData(d => ({ ...d, profile })); setModal(null); setToast({ text: '个人信息已保存', kind: 'ok' }) }} />}
      {modal === 'new-task' && <NewTask total={activeClass?.studentCount || classStudents.length} audience={activeClass?.name || '当前班级'} onClose={() => setModal(null)} onSave={task => { setData(d => ({ ...d, tasks: [task, ...d.tasks] })); setModal(null); showTaskQr(task) }} />}
      {modal === 'task-qr' && selectedTask && <Modal title="任务发布码" onClose={() => setModal(null)}><div className="qr-panel"><div className="qr-title"><QrCode size={20} /><b>{selectedTask.title}</b></div><img src={qrUrl} alt="任务二维码" /><div className={`qr-sync-state ${sync.connected ? 'online' : ''}`}><span><i />{sync.connected ? '自动回收已开启' : '当前为单机备用模式'}</span><small>{sync.connected ? `学生提交后自动同步至本机 · ${sync.address}` : '启动 Windows 本地服务后可免二次扫码'}</small></div><button className="secondary" onClick={() => { const a = document.createElement('a'); a.href = qrUrl; a.download = `${selectedTask.title}-任务二维码.png`; a.click() }}><Download size={18} />保存二维码</button></div></Modal>}
      {modal === 'feedback' && <FeedbackImport onClose={() => setModal(null)} onImport={feedback => { const exists = data.feedback.some(f => f.id === feedback.id); if (!exists) setData(d => ({ ...d, feedback: [feedback, ...d.feedback], tasks: d.tasks.map(t => t.id === feedback.taskId ? { ...t, completed: Math.min(t.total, t.completed + 1) } : t) })); setModal(null); setToast({ text: exists ? '这份反馈已收录' : `已收录 ${feedback.student} 的反馈`, kind: 'ok' }) }} />}
      {modal === 'settings' && <Modal title="设置与本地备份" onClose={() => setModal(null)}><div className="settings-list"><div><span className="setting-icon"><ShieldCheck /></span><div><b>离线数据模式</b><p>班级、任务与材料索引仅保存在此设备浏览器中。</p></div><em>已开启</em></div><button onClick={() => setModal('profile')}><CircleUserRound size={19} /><span><b>个人信息设置</b><small>姓名、学校、任教学科和关怀寄语</small></span></button><button onClick={() => exportData(data)}><Download size={19} /><span><b>导出完整备份</b><small>保存为加密前的 JSON 数据文件</small></span></button><button onClick={() => fileRef.current?.click()}><Upload size={19} /><span><b>从备份恢复</b><small>导入此前导出的本地文件</small></span></button><input ref={fileRef} hidden type="file" accept=".json" onChange={importBackup} /></div></Modal>}
      {modal === 'reminders' && <ReminderCenter data={data} onClose={() => setModal(null)} onNavigate={setPage} />}
      {modal === 'import-students' && activeClass && <ImportStudents classId={activeClass.id} onClose={() => setModal(null)} onImport={students => { setData(d => ({ ...d, students: [...d.students, ...students] })); setModal(null); setToast({ text: `已向${activeClass.name}导入 ${students.length} 名学生`, kind: 'ok' }) }} />}
      {modal === 'upload-material' && <UploadMaterial onClose={() => setModal(null)} onSave={material => { setData(d => ({ ...d, materials: [material, ...d.materials] })); setModal(null); setToast({ text: '材料索引已保存', kind: 'ok' }) }} />}
    </div>
  )
}

function MobileHome({ data, activeClassId, setPage, onQr, onVoice, onTodo, onAddClass }: {
  data: AppData
  activeClassId: string
  setPage: (p: Page) => void
  onQr: () => void
  onVoice: () => void
  onTodo: () => void
  onAddClass: () => void
}) {
  const pending = data.todos.filter(todo => !todo.done)
  const next = pending[0]
  const task = data.tasks[0]
  const progress = task ? Math.round(task.completed / task.total * 100) : 0
  const urgentCount = pending.filter(todo => todo.priority === '紧急').length
  const careStates = [
    { id: 'water', title: '喝口温水吧', text: '忙碌的时候，也别忘了照顾自己。', image: `${import.meta.env.BASE_URL}mascot/xiaoxin-water.webp` },
    { id: 'stretch', title: '起来伸展一下', text: '活动肩颈，让眼睛也休息一会儿。', image: `${import.meta.env.BASE_URL}mascot/xiaoxin-stretch.webp` },
    { id: 'care', title: '心情最重要', text: '事情慢慢做，你已经很认真了。', image: `${import.meta.env.BASE_URL}mascot/xiaoxin-care.webp` }
  ]
  const [careIndex, setCareIndex] = useState(0)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setCareIndex(index => (index + 1) % careStates.length), 9000)
    return () => window.clearInterval(timer)
  }, [careStates.length])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  const activeCare = careStates[careIndex]
  const greeting = greetingFor(now)
  const schedules = [
    { time: '08:00', title: '晨会与班级巡视' },
    { time: '10:10', title: '数学课' },
    { time: '14:30', title: '年级教研' },
    { time: '16:00', title: '提交质量分析' }
  ]
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const nextMinutes = next?.date === '今天' ? next.time.split(':').map(Number) : null
  const nextOverdue = nextMinutes ? nextMinutes[0] * 60 + nextMinutes[1] < currentMinutes : false
  const nextSchedule = schedules.find(item => {
    const [hour, minute] = item.time.split(':').map(Number)
    return hour * 60 + minute >= currentMinutes
  })
  const glance = [
    { value: pending.length, label: '待办', note: urgentCount ? `${urgentCount}项紧急` : '从容处理', className: 'coral' },
    { value: nextSchedule?.time || '已结束', label: '下一日程', note: nextSchedule?.title || '安心收尾', className: 'violet' },
    { value: `${progress}%`, label: '任务回收', note: task ? `${task.completed}/${task.total}人` : '暂无任务', className: 'mint' }
  ]

  return <div className="mobile-today">
    <section className="mobile-greeting">
      <div className="mobile-greeting-copy">
        <span className="mobile-date">{formatToday(now)}</span>
        <h2>{greeting.text}，{data.profile.name} <i>{greeting.icon}</i></h2>
        <p>{data.profile.motto}</p>
      </div>
      <div className="greeting-tip"><Sparkles size={14} /><span>今日心情 · 平静</span></div>
    </section>

    <section className="wellness-strip" aria-label="今日关怀">
      <div><span>💧</span><b>5 杯</b><small>今日饮水</small></div>
      <div><span>🌿</span><b>3 次</b><small>起身活动</small></div>
      <div><span>☺</span><b>平静</b><small>今日心情</small></div>
    </section>

    <section className="today-glance" aria-label="今日一览">
      {glance.map(item => <button key={item.label} className={`glance-card ${item.className}`} onClick={() => item.label === '待办' ? setPage('todos') : item.label === '任务回收' ? setPage('tasks') : undefined}>
        <strong>{item.value}</strong><span>{item.label}</span><small>{item.note}</small>
      </button>)}
    </section>

    <section className="mobile-quick">
      <button onClick={onVoice}><span className="quick-icon voice"><Mic /></span><b>问小昕</b><small>语音来处理</small></button>
      <button onClick={onQr}><span className="quick-icon qr"><QrCode /></span><b>发布任务</b><small>生成二维码</small></button>
      <button onClick={onTodo}><span className="quick-icon todo"><Plus /></span><b>添加待办</b><small>一句话记下</small></button>
      <button onClick={() => setPage('class')}><span className="quick-icon class"><Users /></span><b>班级管理</b><small>{data.classes.length} 个班级</small></button>
    </section>

    <div className="today-section-head"><div><span>{nextOverdue ? '需要关注' : '现在'}</span><h3>{nextOverdue ? '已超时待办' : '下一件事'}</h3></div><button onClick={() => setPage('todos')}>全部待办</button></div>
    {next ? <section className="next-card" onClick={() => setPage('todos')}>
      <div className="next-time"><Clock3 size={18} /><strong>{next.time}</strong><span>{nextOverdue ? '已超时' : next.date}</span></div>
      <div className="next-copy"><span className="next-priority">{next.priority}</span><h3>{next.title}</h3><p>{next.source} · 预计 15 分钟</p></div>
      <span className="next-open">›</span>
    </section> : <section className="next-card all-done"><CheckCircle2 /><div><h3>今天的待办完成啦</h3><p>可以安心喝口水，休息一下。</p></div></section>}

    <div className="today-section-head class-head"><div><span>CLASSROOMS</span><h3>我的班级</h3></div><button onClick={() => setPage('class')}>班级管理</button></div>
    <section className="mobile-classes">
      {data.classes.map((item, index) => <button className={`mobile-class-card ${['mint', 'coral', 'violet'][index % 3]} ${item.id === activeClassId ? 'active' : ''}`} key={item.id} onClick={() => setPage('class')}>
        <div className="class-card-top"><span>{item.id === activeClassId ? '当前班级' : item.role}</span><Users size={18} /></div>
        <h3>{item.name}</h3><p>{item.subject} · {item.studentCount} 位学生</p>
        <footer><Clock3 size={13} />{item.next}</footer>
      </button>)}
      <button className="mobile-class-card add-class-card" onClick={onAddClass}><span><Plus size={22} /></span><h3>添加班级</h3><p>建立新的班级工作空间</p></button>
    </section>

    <section className="today-flow">
      {pending.slice(1, 4).map((todo, index) => <button key={todo.id} className="flow-row" onClick={() => setPage('todos')}>
        <span className={`flow-dot dot-${index}`} /><time>{todo.date === '今天' ? todo.time : todo.date}</time>
        <div><b>{todo.title}</b><small>{todo.source}</small></div><span className="flow-arrow">›</span>
      </button>)}
    </section>

    {task && <section className="class-pulse" onClick={() => setPage('tasks')}>
      <div className="pulse-head"><div><span>班级动态</span><h3>{task.title}</h3></div><strong>{progress}%</strong></div>
      <div className="pulse-track"><i style={{ width: `${progress}%` }} /></div>
      <div className="pulse-meta"><span><ClipboardCheck size={15} />已回收 {task.completed} 份</span><span>还差 {task.total - task.completed} 人</span></div>
    </section>}

    <p className="mobile-quote"><Sparkles size={15} /> 今天也已经做得很好了</p>
    <aside className={`pet-patrol pet-${activeCare.id}`} aria-live="polite">
      <div className="pet-bubble"><b>{activeCare.title}</b><span>{activeCare.text}</span></div>
      <div className="patrol-stage" aria-hidden="true">
        {careStates.map((state, index) => <img key={state.id} className={index === careIndex ? `active pet-${state.id}` : ''} src={state.image} alt="" />)}
      </div>
    </aside>
  </div>
}

function Home({ data, studentTotal, activeClassName, setPage, updateTodo, onQr }: { data: AppData; studentTotal: number; activeClassName: string; setPage: (p: Page) => void; updateTodo: (id: string) => void; onQr: () => void }) {
  const pending = data.todos.filter(t => !t.done)
  const progress = data.tasks.length ? Math.round(data.tasks[0].completed / data.tasks[0].total * 100) : 0
  const now = new Date()
  const greeting = greetingFor(now)
  return <div className="dashboard">
    <section className="welcome">
      <div><span className="sun">{greeting.icon}</span><h2>{greeting.text}，{data.profile.name}</h2><p>今天有 <b>{pending.length} 项待办</b>，1 项需要优先处理。保持从容，一件件来。</p></div>
      <button className="primary" onClick={onQr}><QrCode size={19} />发布扫码任务</button>
    </section>
    <div className="metrics">
      <article><span className="metric-icon green"><Users /></span><div><small>班级人数</small><strong>{studentTotal}</strong><em>{activeClassName}</em></div></article>
      <article><span className="metric-icon amber"><ListTodo /></span><div><small>待处理事项</small><strong>{pending.length}</strong><em className="danger">1 项今天到期</em></div></article>
      <article><span className="metric-icon blue"><ClipboardCheck /></span><div><small>任务回收</small><strong>{data.tasks[0]?.completed || 0}<i>/{data.tasks[0]?.total || 0}</i></strong><em>完成率 {progress}%</em></div></article>
      <article><span className="metric-icon purple"><FileArchive /></span><div><small>材料总数</small><strong>{data.materials.length}</strong><em>本地安全存储</em></div></article>
    </div>
    <div className="dashboard-grid">
      <section className="panel todo-panel"><header><div><h3>今日待办</h3><p>按紧急程度自动排序</p></div><button onClick={() => setPage('todos')}>查看全部</button></header>
        <div className="todo-list">{pending.slice(0, 4).map(todo => <TodoRow key={todo.id} todo={todo} toggle={() => updateTodo(todo.id)} />)}</div>
      </section>
      <section className="panel focus-panel"><header><div><h3>任务回收进度</h3><p>扫码反馈实时汇总</p></div><button className="more"><MoreHorizontal /></button></header>
        {data.tasks[0] ? <><div className="focus-task"><span><QrCode /></span><div><b>{data.tasks[0].title}</b><small>{data.tasks[0].audience} · 截止 {data.tasks[0].due}</small></div></div><div className="progress"><i style={{ width: `${progress}%` }} /></div><div className="progress-meta"><span>已回收 <b>{data.tasks[0].completed}</b> 份</span><span>未提交 <b>{data.tasks[0].total - data.tasks[0].completed}</b> 人</span></div><button className="secondary full" onClick={() => setPage('tasks')}>查看名单与提醒</button></> : <Empty icon={QrCode} title="还没有任务" text="发布后即可查看回收进度" />}
      </section>
      <section className="panel schedule"><header><div><h3>今日日程</h3><p>{formatToday(now)}</p></div><CalendarDays size={21} /></header>
        {[['08:00', '晨会与班级巡视', '高一（3）班'], ['10:10', '数学课 · 函数单调性', '博学楼 302'], ['14:30', '年级组教研会', '行政楼 201'], ['16:00', '提交质量分析', '线上截止']].map((x, i) => <div className={`schedule-row ${i === 2 ? 'now' : ''}`} key={x[0]}><time>{x[0]}</time><i /><div><b>{x[1]}</b><span>{x[2]}</span></div></div>)}
      </section>
      <section className="panel assistant"><div className="assistant-head"><span><Sparkles /></span><div><h3>智能整理建议</h3><p>基于本地资料生成，不上传内容</p></div></div><div className="suggestion"><WandSparkles size={20} /><div><b>职称材料缺少 2 项佐证</b><p>检测到“公开课证明”和“年度考核表”尚未归档。</p></div></div><button className="secondary full" onClick={() => setPage('career')}>去补充材料</button></section>
    </div>
  </div>
}

function TodoRow({ todo, toggle }: { todo: Todo; toggle: () => void }) {
  return <div className={`todo-row ${todo.done ? 'done' : ''}`}><button className="check" onClick={toggle}>{todo.done && <Check size={15} />}</button><div><b>{todo.title}</b><span>{todo.source}</span></div><em className={`priority ${todo.priority}`}>{todo.priority}</em><time><Clock3 size={15} />{todo.date} {todo.time}</time></div>
}

function Classroom({ students, classes, activeClassId, hasSearch, onClassChange, onAddClass, onEditClass, onEditStudent, onAdd, onImport }: { students: Student[]; classes: SchoolClass[]; activeClassId: string; hasSearch: boolean; onClassChange: (id: string) => void; onAddClass: () => void; onEditClass: () => void; onEditStudent: (student: Student) => void; onAdd: () => void; onImport: () => void }) {
  const [view, setView] = useState<'cards' | 'table'>('table')
  const activeClass = classes.find(item => item.id === activeClassId) || classes[0]
  const attendance = students.length ? `${(students.reduce((sum, student) => sum + student.attendance, 0) / students.length).toFixed(1)}%` : '—'
  const leaders = students.filter(student => student.tags.length).length
  return <div className="page-stack"><section className="page-hero compact"><div><span className="section-kicker">CLASS MANAGEMENT</span><h2>{activeClass?.name || '我的班级'}</h2><p>{activeClass ? `${activeClass.subject} · ${activeClass.role} · ${activeClass.room}` : '添加班级后开始管理学生信息'}</p></div><div className="hero-actions"><button className="secondary" onClick={onEditClass}><Settings size={18} />修改班级</button><button className="secondary" onClick={onAddClass}><Plus size={18} />添加班级</button><button className="secondary" onClick={onImport}><Upload size={18} />表格导入</button><button className="primary" onClick={onAdd}><UserPlus size={18} />添加学生</button></div></section>
    <div className="class-switch-row">{classes.map(item => <button className={item.id === activeClassId ? 'active' : ''} key={item.id} onClick={() => onClassChange(item.id)}><span>{item.name}</span><small>{item.subject} · {item.role}</small></button>)}<button className="add" onClick={onAddClass}><Plus size={17} /><span>新班级</span></button></div>
    <div className="class-summary"><div><strong>{students.length}</strong><span>学生总数</span></div><div><strong>{attendance}</strong><span>本周出勤</span></div><div><strong>{leaders}</strong><span>班级干部</span></div><div><strong>—</strong><span>本月生日</span></div><span className="class-view"><button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>列表</button><button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>卡片</button></span></div>
    {students.length === 0 ? <Empty icon={Users} title={hasSearch ? '没有匹配的学生' : '这个班级还没有学生'} text={hasSearch ? '更换关键词后再试' : '可以添加学生，或直接从表格批量导入'} /> : view === 'table' ? <section className="table-card"><table><thead><tr><th>学生</th><th>学号</th><th>班级角色</th><th>家长</th><th>出勤率</th><th /></tr></thead><tbody>{students.map(s => <tr key={s.id}><td><div className={`student-avatar ${s.gender === '女' ? 'girl' : ''}`}>{s.name.slice(0, 1)}</div><b>{s.name}</b></td><td>{s.number}</td><td><div className="tags">{s.tags.length ? s.tags.map(t => <span key={t}>{t}</span>) : <i>—</i>}</div></td><td><b className="subtle">{s.guardian}</b><small>{s.phone}</small></td><td><div className="attendance"><i><em style={{ width: `${s.attendance}%` }} /></i><b>{s.attendance}%</b></div></td><td><button aria-label={`修改${s.name}信息`} className="icon-btn" onClick={() => onEditStudent(s)}><MoreHorizontal /></button></td></tr>)}</tbody></table></section> : <div className="student-cards">{students.map(s => <article key={s.id}><div className={`student-avatar big ${s.gender === '女' ? 'girl' : ''}`}>{s.name.slice(0, 1)}</div><h3>{s.name}</h3><span>{s.number}</span><div className="tags">{s.tags.map(t => <span key={t}>{t}</span>)}</div><footer><span>出勤 <b>{s.attendance}%</b></span><button onClick={() => onEditStudent(s)}>查看档案</button></footer></article>)}</div>}
  </div>
}

function Todos({ data, updateTodo, onAdd }: { data: AppData; updateTodo: (id: string) => void; onAdd: () => void }) {
  const [filter, setFilter] = useState('待处理')
  const shown = data.todos.filter(t => filter === '全部' || filter === '已完成' ? (filter === '全部' || t.done) : !t.done)
  return <div className="page-stack"><section className="page-hero compact"><div><span className="section-kicker">FOCUS & SCHEDULE</span><h2>待办与日程</h2><p>把零散事务收进一处，按轻重缓急完成</p></div><button className="primary" onClick={onAdd}><Plus size={18} />新建待办</button></section><div className="filter-tabs">{['待处理', '已完成', '全部'].map(x => <button key={x} className={filter === x ? 'active' : ''} onClick={() => setFilter(x)}>{x}</button>)}</div><section className="panel todos-page"><div className="date-group"><h3>今天 <span>{data.todos.filter(t => !t.done && t.date === '今天').length} 项</span></h3>{shown.map(t => <TodoRow key={t.id} todo={t} toggle={() => updateTodo(t.id)} />)}</div></section></div>
}

function Tasks({ data, onNew, onQr, onScan }: { data: AppData; onNew: () => void; onQr: (t: Task) => void; onScan: () => void }) {
  const [current, setCurrent] = useState<Task | null>(data.tasks[0] || null)
  const feedback = data.feedback.filter(f => f.taskId === current?.id)
  return <div className="page-stack"><section className="page-hero qr-hero"><div><span className="section-kicker">QR PUBLISHING</span><h2>发布中心</h2><p>信息、图片、打卡、报名和各种接龙，都能生成二维码发布并自动回收</p><div className="privacy-pill"><ShieldCheck size={16} />同一局域网内自动同步到老师端</div></div><div className="hero-actions"><button className="secondary light" onClick={onScan}><ScanLine size={18} />收取备用反馈</button><button className="primary gold" onClick={onNew}><Plus size={18} />新建发布</button></div></section>
    <div className="publish-types">{['信息收集', '图片收集', '打卡任务', '接龙报名', '确认回执'].map(item => <button key={item} onClick={onNew}><QrCode size={17} /><span>{item}</span></button>)}</div>
    <div className="task-layout"><section className="task-list panel"><header><h3>已发布内容</h3><span>{data.tasks.length}</span></header>{data.tasks.map(t => { const pct = Math.round(t.completed / t.total * 100); return <button className={current?.id === t.id ? 'active' : ''} key={t.id} onClick={() => setCurrent(t)}><span className="task-icon"><QrCode /></span><div><b>{t.title}</b><small>{t.kind || '信息收集'} · {t.completed}/{t.total} 人</small><i><em style={{ width: `${pct}%` }} /></i></div><strong>{pct}%</strong></button>})}</section>
      <section className="panel task-detail">{current ? <><header><div><span className="status-dot">{current.kind || '信息收集'} · 进行中</span><h3>{current.title}</h3><p>{current.description}</p></div><button className="secondary" onClick={() => onQr(current)}><QrCode size={17} />查看发布码</button></header><div className="task-stats"><div><strong>{current.completed}</strong><span>已回收</span></div><div><strong>{current.total - current.completed}</strong><span>待提交</span></div><div><strong>{Math.round(current.completed / current.total * 100)}%</strong><span>完成率</span></div><div><strong>{current.due.split(' ')[0].slice(5)}</strong><span>截止日期</span></div></div><div className="feedback-head"><h4>自动同步记录</h4><button onClick={onScan}><ScanLine size={16} />收取备用反馈</button></div>{feedback.length ? <div className="feedback-list">{feedback.map(f => <div key={f.id}><div className="student-avatar">{f.student.slice(0, 1)}</div><div><b>{f.student}</b><span>{f.studentNo} · {f.submitted}</span></div><em><Check size={15} />已同步</em></div>)}</div> : <Empty icon={ClipboardCheck} title="等待第一份反馈" text="学生提交后会自动显示在这里" />}</> : <Empty icon={QrCode} title="还没有发布内容" text="点击右上角开始发布" />}</section>
    </div>
  </div>
}

function Materials({ data, setData }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>> }) {
  const [directory, setDirectory] = useState('全部文档')
  const [creating, setCreating] = useState(false)
  const [folderName, setFolderName] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const shown = data.materials.filter(item => directory === '全部文档' || item.category === directory || item.category.startsWith(`${directory}/`))

  async function importFiles(files: FileList | null, preserveFolders: boolean) {
    if (!files?.length) return
    const items: AppData['materials'] = []
    const foundDirectories = new Set(data.directories)
    for (const file of Array.from(files)) {
      const id = uid('m')
      const relativePath = preserveFolders ? file.webkitRelativePath : ''
      const pathParts = relativePath.split('/').filter(Boolean)
      const fileDirectory = preserveFolders && pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : directory === '全部文档' ? '未分类' : directory
      const segments = fileDirectory.split('/')
      segments.forEach((_, index) => foundDirectories.add(segments.slice(0, index + 1).join('/')))
      await storeLocalFile(id, file)
      items.push({
        id,
        name: file.name,
        category: fileDirectory,
        path: relativePath || `${fileDirectory}/${file.name}`,
        storageKey: id,
        updated: '刚刚',
        size: file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`,
        starred: false
      })
    }
    setData(current => ({ ...current, directories: [...foundDirectories], materials: [...items, ...current.materials] }))
  }

  function createFolder() {
    const name = folderName.trim()
    if (!name) return
    const path = directory === '全部文档' ? name : `${directory}/${name}`
    setData(current => ({ ...current, directories: current.directories.includes(path) ? current.directories : [...current.directories, path] }))
    setDirectory(path)
    setFolderName('')
    setCreating(false)
  }

  return <div className="page-stack document-library"><section className="page-hero compact"><div><span className="section-kicker">LOCAL DOCUMENT LIBRARY</span><h2>资料文档库</h2><p>自己建立目录，文件与文件夹完整保存在本机</p></div><div className="hero-actions"><button className="secondary" onClick={() => setCreating(true)}><Plus size={18} />新建目录</button><button className="secondary" onClick={() => folderInput.current?.click()}><FolderOpen size={18} />上传文件夹</button><button className="primary" onClick={() => fileInput.current?.click()}><Upload size={18} />上传文件</button></div><input ref={fileInput} hidden type="file" multiple onChange={event => { void importFiles(event.target.files, false); event.target.value = '' }} /><input ref={folderInput} hidden type="file" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={event => { void importFiles(event.target.files, true); event.target.value = '' }} /></section>
    <div className="material-layout"><aside className="category-panel panel"><header><h3>我的目录</h3><button onClick={() => setCreating(true)}><Plus size={16} /></button></header><button className={directory === '全部文档' ? 'active' : ''} onClick={() => setDirectory('全部文档')}><Archive size={17} />全部文档<span>{data.materials.length}</span></button>{data.directories.map(item => <button key={item} className={directory === item ? 'active' : ''} onClick={() => setDirectory(item)}><FolderOpen size={17} />{item}<span>{data.materials.filter(file => file.category === item || file.category.startsWith(`${item}/`)).length}</span></button>)}</aside>
      <section className="panel files"><header><div><span className="library-path">资料文档库 / {directory}</span><h3>{directory}</h3></div><span>{shown.length} 个文件</span></header>{creating && <div className="new-folder-row"><FolderOpen size={20} /><input autoFocus value={folderName} onChange={event => setFolderName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') createFolder(); if (event.key === 'Escape') setCreating(false) }} placeholder="输入目录名称" /><button className="primary" onClick={createFolder}>建立</button><button className="secondary" onClick={() => setCreating(false)}>取消</button></div>}{shown.length ? shown.map(item => <div className="file-row" key={item.id}><span className={`file-type ${item.name.endsWith('.pdf') ? 'pdf' : item.name.endsWith('.xlsx') ? 'xls' : ''}`}><FileText /></span><div><b>{item.name}</b><span>{item.path || item.category} · {item.size} · {item.updated}</span></div><button className={`icon-btn ${item.starred ? 'starred' : ''}`} onClick={() => setData(current => ({ ...current, materials: current.materials.map(file => file.id === item.id ? { ...file, starred: !file.starred } : file) }))}><Star size={18} /></button><button className="icon-btn"><MoreHorizontal /></button></div>) : <Empty icon={FolderOpen} title="这个目录还是空的" text="上传文件或整个文件夹开始整理" />}</section></div>
  </div>
}

function Career() {
  const items: [string, number, number][] = [['基本资格与任职年限', 4, 4], ['教育教学成果', 7, 8], ['教科研与论文', 3, 5], ['公开课与获奖证明', 4, 6], ['年度考核与师德材料', 5, 5]]
  const total = items.reduce((a, x) => a + x[1], 0), max = items.reduce((a, x) => a + x[2], 0)
  return <div className="page-stack"><section className="career-hero"><div><span className="section-kicker">PROFESSIONAL GROWTH</span><h2>职称评审助手</h2><p>对照申报要求逐项归集，少遗漏、不返工</p><div className="career-meta"><span><Award size={18} />目标：高级教师</span><span><CalendarDays size={18} />预计申报：2026年10月</span></div></div><Ring value={Math.round(total / max * 100)} label="材料完成度" /></section><div className="career-grid"><section className="panel checklist"><header><div><h3>申报材料清单</h3><p>依据本地设置的评审要求</p></div><button className="secondary"><Upload size={17} />导入评审文件</button></header>{items.map(([name, done, all]) => <div className="checklist-row" key={name as string}><span className={done === all ? 'complete' : ''}>{done === all ? <Check /> : <FolderOpen />}</span><div><b>{name}</b><i><em style={{ width: `${Number(done) / Number(all) * 100}%` }} /></i></div><strong>{done}/{all}</strong><button className="icon-btn"><MoreHorizontal /></button></div>)}</section><aside className="panel gap-card"><span className="assistant-orb"><Sparkles /></span><h3>材料缺口提醒</h3><p>当前有 3 项材料建议尽快补齐。</p><div><b>市级公开课证明</b><span>教学成果 · 缺少盖章页</span></div><div><b>近五年年度考核表</b><span>2022年度尚未归档</span></div><div><b>论文检索证明</b><span>教科研 · 建议补充</span></div><button className="primary full">生成补齐计划</button></aside></div></div>
}

function Documents({ notify }: { notify: (x: string) => void }) {
  const tools = [
    ['图片转文字', '扫描纸质通知、名单和成绩表', ScanLine, '支持相机与截图'],
    ['表格智能整理', '识别混乱名单并统一格式', ClipboardCheck, '姓名/学号自动对齐'],
    ['PDF 合并拆分', '按页整理申报与归档材料', FileArchive, '全程本地处理'],
    ['文档批量重命名', '按班级、姓名或日期自动命名', WandSparkles, '一键预览规则'],
    ['成绩单批量生成', '导入表格生成学生个人报告', GraduationCap, '模板化输出'],
    ['通知回执生成', '把通知快速变为扫码确认任务', QrCode, '无需重复录入']
  ] as const
  return <div className="page-stack"><section className="page-hero compact"><div><span className="section-kicker">DOCUMENT TOOLBOX</span><h2>文档处理工具</h2><p>能扫描就不手输，能批量就不重复</p></div></section><div className="doc-tools">{tools.map(([title, desc, Icon, badge]) => <button key={title} onClick={() => notify(`${title}已进入本地处理队列`)}><span><Icon /></span><div><h3>{title}</h3><p>{desc}</p><em>{badge}</em></div><strong>开始使用 →</strong></button>)}</div><section className="scan-banner"><div className="scan-visual"><ScanLine /></div><div><span>快速入口</span><h3>拍照扫描纸质材料</h3><p>自动裁边、增强清晰度并识别文字，识别结果只保存在本机。</p></div><button className="primary">打开扫描器</button></section></div>
}

type VoiceRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

type VoiceRecognitionCtor = new () => VoiceRecognition

function VoiceAssistant({ todos, total, audience, onClose, onPublish }: { todos: Todo[]; total: number; audience: string; onClose: () => void; onPublish: (task: Task) => void }) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState('我在。你可以问我接下来要做什么，或直接发布简单任务。')
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voicePrefs, setVoicePrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zhixu_voice_settings_v1') || '') as { voiceURI: string; rate: number; pitch: number }
    } catch {
      return { voiceURI: '', rate: .96, pitch: 1 }
    }
  })
  const recognitionRef = useRef<VoiceRecognition | null>(null)
  const voiceApi = window as typeof window & { SpeechRecognition?: VoiceRecognitionCtor; webkitSpeechRecognition?: VoiceRecognitionCtor }
  const Recognition = voiceApi.SpeechRecognition || voiceApi.webkitSpeechRecognition

  useEffect(() => () => {
    recognitionRef.current?.stop()
    speechSynthesis.cancel()
  }, [])

  useEffect(() => {
    const refresh = () => {
      const available = speechSynthesis.getVoices().slice().sort((a, b) => {
        const aZh = a.lang.toLowerCase().startsWith('zh') ? 0 : 1
        const bZh = b.lang.toLowerCase().startsWith('zh') ? 0 : 1
        return aZh - bZh || a.name.localeCompare(b.name, 'zh-CN')
      })
      setVoices(available)
      if (!voicePrefs.voiceURI) {
        const preferred = available.find(voice => voice.lang.toLowerCase().startsWith('zh-cn')) || available.find(voice => voice.lang.toLowerCase().startsWith('zh'))
        if (preferred) setVoicePrefs(current => ({ ...current, voiceURI: preferred.voiceURI }))
      }
    }
    refresh()
    speechSynthesis.addEventListener('voiceschanged', refresh)
    return () => speechSynthesis.removeEventListener('voiceschanged', refresh)
  }, [voicePrefs.voiceURI])

  useEffect(() => {
    localStorage.setItem('zhixu_voice_settings_v1', JSON.stringify(voicePrefs))
  }, [voicePrefs])

  function speak(text: string) {
    speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = voicePrefs.rate
    utterance.pitch = voicePrefs.pitch
    const selected = voices.find(voice => voice.voiceURI === voicePrefs.voiceURI)
    const chineseVoice = voices.find(voice => voice.lang.toLowerCase().startsWith('zh'))
    if (selected || chineseVoice) utterance.voice = selected || chineseVoice!
    speechSynthesis.speak(utterance)
  }

  function nextDue(raw: string) {
    const date = new Date()
    if (raw.includes('后天')) date.setDate(date.getDate() + 2)
    else if (raw.includes('明天')) date.setDate(date.getDate() + 1)
    let hour = raw.includes('晚上') ? 20 : raw.includes('下午') ? 15 : raw.includes('上午') ? 10 : 18
    let minute = 0
    const time = raw.match(/(\d{1,2})\s*[点时](半|(\d{1,2})\s*分?)?/)
    if (time) {
      hour = Number(time[1])
      if ((raw.includes('下午') || raw.includes('晚上')) && hour < 12) hour += 12
      minute = time[2] === '半' ? 30 : Number(time[3] || 0)
    }
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return `${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  function handleCommand(input: string) {
    const command = input.replace(/[，。！？、]/g, ' ').replace(/问小昕|小昕|问小知|小知/g, '').trim()
    setTranscript(input)
    if (/下面.*干嘛|接下来.*做什么|还有.*待办|播报.*待办|今天.*任务/.test(command)) {
      const pending = todos.filter(todo => !todo.done).slice(0, 5)
      const message = pending.length
        ? `你接下来有${pending.length}项待办。${pending.map((todo, index) => `第${index + 1}项，${todo.title}，${todo.date}${todo.time}`).join('。')}。`
        : '目前没有未完成的待办，可以稍微休息一下。'
      setReply(message)
      speak(message)
      return
    }
    if (/发布.*任务|布置.*任务|发个.*通知/.test(command)) {
      const raw = command.replace(/^.*?(?:发布|布置)(?:一个|个)?(?:简单)?任务\s*[:：]?/, '').replace(/^.*?发个通知\s*[:：]?/, '').trim()
      if (!raw) {
        const message = '请在发布任务后面说出任务内容，例如：发布简单任务，明天带学生证。'
        setReply(message)
        speak(message)
        return
      }
      const title = raw.split(/截止|请在/)[0].trim() || raw
      const task: Task = {
        id: uid('q'),
        kind: '确认回执',
        title,
        description: '由小昕语音助手快速发布，请按要求完成并提交确认。',
        due: nextDue(raw),
        fields: ['是否完成', '备注'],
        audience,
        created: new Date().toISOString().slice(0, 10),
        completed: 0,
        total
      }
      const message = `已为${audience}发布任务：${title}。截止时间是${task.due.slice(5)}。`
      setReply(message)
      speak(message)
      window.setTimeout(() => onPublish(task), 900)
      return
    }
    const message = '我暂时没听懂。你可以说：下面我要干嘛，或者，发布简单任务，明天带学生证。'
    setReply(message)
    speak(message)
  }

  async function startListening() {
    setListening(true)
    setTranscript('')
    setReply('正在听，请说“问小昕……”')
    try {
      const health = await fetch('/api/health')
      if (health.ok) {
        const response = await fetch('/api/voice/recognize', { method: 'POST' })
        if (!response.ok) {
          setListening(false)
          setReply('本地语音引擎没有听清，或尚未安装中文语音包。请重试，也可以输入指令。')
          return
        }
        const result = await response.json() as { text: string }
        setListening(false)
        handleCommand(result.text)
        return
      }
    } catch {
      setListening(false)
    }
    if (!Recognition) {
      const message = '当前浏览器不支持语音识别，可以在下方输入指令。建议在 Windows Edge 或安卓 Chrome 中使用。'
      setReply(message)
      speak(message)
      setListening(false)
      return
    }
    recognitionRef.current?.stop()
    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = event => {
      let value = ''
      let final = false
      for (let index = 0; index < event.results.length; index += 1) {
        value += event.results[index][0].transcript
        final = final || event.results[index].isFinal
      }
      setTranscript(value)
      if (final) handleCommand(value)
    }
    recognition.onerror = () => {
      setListening(false)
      setReply('没有听清，请靠近麦克风再说一次。')
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    setListening(true)
    setReply('正在听，请说“问小昕……”')
    recognition.start()
  }

  return <div className="voice-backdrop" onMouseDown={onClose}>
    <section className="voice-sheet" onMouseDown={event => event.stopPropagation()}>
      <header><div className="xiaozhi-mark"><Sparkles size={20} /></div><div><b>问小昕</b><span>本地语音工作助手</span></div><button aria-label="语音播报设置" className={voiceSettingsOpen ? 'active' : ''} onClick={() => setVoiceSettingsOpen(value => !value)}><Settings size={18} /></button><button aria-label="关闭语音助手" onClick={onClose}><X size={19} /></button></header>
      <div className={`voice-orb ${listening ? 'listening' : ''}`}>
        <button aria-label={listening ? '正在聆听' : '开始语音输入'} onClick={startListening}><Mic size={30} /></button>
        {listening && <><i /><i /><i /></>}
      </div>
      <div className="voice-status"><b>{listening ? '正在聆听…' : '点击麦克风，然后说话'}</b><span>{transcript || '“问小昕，下面我要干嘛？”'}</span></div>
      <div className="voice-reply"><Volume2 size={18} /><p>{reply}</p><button aria-label="重新播报" onClick={() => speak(reply)}>重播</button></div>
      {voiceSettingsOpen && <div className="voice-settings">
        <div className="voice-settings-title"><div><b>播报声音</b><span>使用设备中已安装的系统人声</span></div><button onClick={() => speak('你好，我是小昕。接下来由我陪你处理今天的工作。')}><Volume2 size={15} />试听</button></div>
        <label>选择人声<select value={voicePrefs.voiceURI} onChange={event => setVoicePrefs({ ...voicePrefs, voiceURI: event.target.value })}>{voices.length ? voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>) : <option value="">系统默认中文人声</option>}</select></label>
        <div className="voice-range-grid">
          <label><span>语速 <em>{voicePrefs.rate.toFixed(1)}×</em></span><input type="range" min=".6" max="1.4" step=".1" value={voicePrefs.rate} onChange={event => setVoicePrefs({ ...voicePrefs, rate: Number(event.target.value) })} /></label>
          <label><span>音调 <em>{voicePrefs.pitch.toFixed(1)}</em></span><input type="range" min=".7" max="1.3" step=".1" value={voicePrefs.pitch} onChange={event => setVoicePrefs({ ...voicePrefs, pitch: Number(event.target.value) })} /></label>
        </div>
        <p><ShieldCheck size={14} />人声设置仅保存在当前设备</p>
      </div>}
      <div className="voice-examples">
        <button onClick={() => handleCommand('问小昕，下面我要干嘛')}><ListTodo size={16} />播报接下来待办</button>
        <button onClick={() => handleCommand('问小昕，发布简单任务：明天带学生证')}><QrCode size={16} />发布示例任务</button>
      </div>
      <label className="voice-text-fallback">也可以输入指令<input value={transcript} onChange={event => setTranscript(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && transcript.trim()) handleCommand(transcript) }} placeholder="输入后按 Enter" /></label>
      <footer><kbd>Ctrl</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>X</kbd><em>随时唤出小昕</em></footer>
    </section>
  </div>
}

function NewClass({ initial, onClose, onSave }: { initial?: SchoolClass; onClose: () => void; onSave: (item: SchoolClass) => void }) {
  const [form, setForm] = useState({ name: initial?.name || '', role: initial?.role || '班主任', subject: initial?.subject || '数学', studentCount: initial?.studentCount || 0, room: initial?.room || '', next: initial?.next || '暂无日程' })
  return <Modal title={initial ? '修改班级信息' : '添加班级'} onClose={onClose}><form className="modal-form" onSubmit={event => { event.preventDefault(); onSave({ id: initial?.id || uid('c'), ...form }) }}>
    <label>班级名称<input autoFocus required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="例如：高一（4）班" /></label>
    <div className="form-grid"><label>我的身份<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}><option>班主任</option><option>任课教师</option><option>年级负责人</option></select></label><label>任教学科<input value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} /></label></div>
    <div className="form-grid"><label>学生人数<input type="number" min="0" value={form.studentCount} onChange={event => setForm({ ...form, studentCount: Number(event.target.value) })} /></label><label>教室位置<input value={form.room} onChange={event => setForm({ ...form, room: event.target.value })} placeholder="例如：博学楼 304" /></label></div>
    <label>下一项班级日程<input value={form.next} onChange={event => setForm({ ...form, next: event.target.value })} placeholder="例如：班会 · 周五 15:30" /></label>
    <footer><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary">{initial ? '保存修改' : '添加班级'}</button></footer>
  </form></Modal>
}

function ProfileSettings({ profile, onClose, onSave }: { profile: TeacherProfile; onClose: () => void; onSave: (profile: TeacherProfile) => void }) {
  const [form, setForm] = useState(profile)
  return <Modal title="个人信息设置" onClose={onClose}><form className="modal-form" onSubmit={event => { event.preventDefault(); onSave(form) }}>
    <div className="profile-editor-head"><div className="avatar big">{form.name.slice(0, 1) || '师'}</div><div><b>我的教师名片</b><span>信息仅保存在当前设备</span></div></div>
    <div className="form-grid"><label>显示姓名<input required autoFocus value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>学校<input value={form.school} onChange={event => setForm({ ...form, school: event.target.value })} /></label></div>
    <div className="form-grid"><label>职务<select value={form.title} onChange={event => setForm({ ...form, title: event.target.value })}><option>班主任</option><option>任课教师</option><option>年级负责人</option><option>教研组长</option></select></label><label>任教学科<input value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} /></label></div>
    <label>联系电话 <small>选填，仅供本机档案使用</small><input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label>
    <label>给自己的每日寄语<textarea value={form.motto} onChange={event => setForm({ ...form, motto: event.target.value })} /></label>
    <footer><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary">保存信息</button></footer>
  </form></Modal>
}

function NewTodo({ onClose, onSave }: { onClose: () => void; onSave: (t: Todo) => void }) {
  const [form, setForm] = useState({ title: '', date: '今天', time: '17:00', priority: '重要' as Todo['priority'], source: '班级事务' })
  return <Modal title="新建待办" onClose={onClose}><form className="modal-form" onSubmit={e => { e.preventDefault(); onSave({ id: uid('t'), ...form, done: false }) }}><label>事项名称<input autoFocus required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例如：收齐家长会回执" /></label><div className="form-grid"><label>日期<select value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}><option>今天</option><option>明天</option><option>本周五</option></select></label><label>时间<input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></label></div><div className="form-grid"><label>优先级<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Todo['priority'] })}><option>紧急</option><option>重要</option><option>普通</option></select></label><label>来源<input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} /></label></div><footer><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary">保存待办</button></footer></form></Modal>
}

function NewStudent({ classId, initial, onClose, onSave }: { classId: string; initial?: Student; onClose: () => void; onSave: (s: Student) => void }) {
  const [form, setForm] = useState({ name: initial?.name || '', number: initial?.number || '', gender: initial?.gender || '男' as Student['gender'], phone: initial?.phone || '', guardian: initial?.guardian || '', tags: initial?.tags.join('、') || '', attendance: initial?.attendance ?? 100 })
  return <Modal title={initial ? '修改学生信息' : '添加学生'} onClose={onClose}><form className="modal-form" onSubmit={e => { e.preventDefault(); onSave({ id: initial?.id || uid('s'), classId, name: form.name, number: form.number, gender: form.gender, phone: form.phone, guardian: form.guardian, tags: form.tags.split(/[、,，]/).map(item => item.trim()).filter(Boolean), attendance: form.attendance }) }}><div className="profile-editor-head"><div className={`student-avatar big ${form.gender === '女' ? 'girl' : ''}`}>{form.name.slice(0, 1) || '生'}</div><div><b>{initial ? '学生个人档案' : '加入当前班级'}</b><span>头像自动显示学生姓氏</span></div></div><div className="form-grid"><label>姓名<input required autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>学号<input required value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} /></label></div><div className="form-grid"><label>性别<select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as Student['gender'] })}><option>男</option><option>女</option></select></label><label>家长姓名<input value={form.guardian} onChange={e => setForm({ ...form, guardian: e.target.value })} /></label></div><label>联系电话<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="仅保存在本机" /></label><div className="form-grid"><label>班级角色与标签<input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="例如：班长、数学课代表" /></label><label>出勤率<input type="number" min="0" max="100" value={form.attendance} onChange={e => setForm({ ...form, attendance: Number(e.target.value) })} /></label></div><footer><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary">{initial ? '保存修改' : '加入班级'}</button></footer></form></Modal>
}

function NewTask({ total, audience, onClose, onSave }: { total: number; audience: string; onClose: () => void; onSave: (t: Task) => void }) {
  const templates: Record<NonNullable<Task['kind']>, string> = {
    '信息收集': '联系电话\n需要说明的信息\n备注',
    '图片收集': '图片上传\n图片说明',
    '打卡任务': '是否完成今日打卡\n打卡照片\n感受',
    '接龙报名': '是否参加\n报名项目\n备注',
    '确认回执': '是否已阅读并确认\n家长签名\n备注'
  }
  const [form, setForm] = useState({ kind: '信息收集' as NonNullable<Task['kind']>, title: '', description: '', due: '2026-07-31 18:00', fields: templates['信息收集'], audience })
  return <Modal title="新建发布" onClose={onClose} wide><form className="modal-form" onSubmit={e => { e.preventDefault(); onSave({ id: uid('q'), kind: form.kind, title: form.title, description: form.description, due: form.due, fields: form.fields.split('\n').map(x => x.trim()).filter(Boolean), audience: form.audience, created: new Date().toISOString().slice(0, 10), completed: 0, total }) }}><div className="offline-hint"><QrCode /><div><b>二维码发布与自动回收</b><span>学生无需账号，扫码填写后在同一局域网内自动同步到老师端。</span></div></div><label>发布类型<div className="publish-kind-grid">{(Object.keys(templates) as Array<NonNullable<Task['kind']>>).map(kind => <button type="button" className={form.kind === kind ? 'active' : ''} key={kind} onClick={() => setForm({ ...form, kind, fields: templates[kind] })}>{kind}</button>)}</div></label><label>发布标题<input required autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={form.kind === '图片收集' ? '例如：暑期实践照片收集' : form.kind === '打卡任务' ? '例如：每日阅读打卡' : '例如：家长会参会确认'} /></label><label>说明<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="向学生或家长说明填写要求" /></label><div className="form-grid"><label>发布对象<input value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} /></label><label>截止时间<input value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} /></label></div><label>学生需要填写的内容 <small>每行一个字段，含“图片”或“照片”时自动显示拍照上传</small><textarea required value={form.fields} onChange={e => setForm({ ...form, fields: e.target.value })} /></label><footer><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary"><QrCode size={17} />生成发布二维码</button></footer></form></Modal>
}

function FeedbackImport({ onClose, onImport }: { onClose: () => void; onImport: (f: Feedback) => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  useEffect(() => () => controlsRef.current?.stop(), [])
  function parse(value = code) {
    try {
      const parsed = decodePayload(value.trim())
      if (parsed.type !== 'zhixu-feedback') throw new Error()
      controlsRef.current?.stop()
      onImport(parsed.feedback)
    } catch { setError('未识别到有效的知昕反馈码内容') }
  }
  async function startScan() {
    setError('')
    setScanning(true)
    try {
      const reader = new BrowserQRCodeReader()
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current!, result => {
        if (result) parse(result.getText())
      })
    } catch {
      setScanning(false)
      setError('无法打开摄像头，请检查系统权限，或使用扫码枪/粘贴方式。')
    }
  }
  return <Modal title="收取学生反馈" onClose={() => { controlsRef.current?.stop(); onClose() }}><div className="scan-box"><span><ScanLine /></span><h3>扫描学生的反馈二维码</h3><p>将学生手机上的反馈码对准摄像头，识别后自动入库。</p>{scanning && <video ref={videoRef} className="scanner-video" muted playsInline />}{!scanning && <button className="camera-start" onClick={startScan}><ScanLine size={19} />打开摄像头扫码</button>}<div className="scan-divider"><i />或使用扫码枪 / 粘贴<i /></div><textarea value={code} onChange={e => setCode(e.target.value)} placeholder="扫描或粘贴反馈码内容" /><button className="primary full" disabled={!code} onClick={() => parse()}><ClipboardCheck size={18} />识别并收录</button>{error && <em className="form-error">{error}</em>}</div></Modal>
}

function ImportStudents({ classId, onClose, onImport }: { classId: string; onClose: () => void; onImport: (s: Student[]) => void }) {
  const [text, setText] = useState('')
  const rows = useMemo(() => text.split('\n').map(x => x.trim()).filter(Boolean), [text])
  return <Modal title="批量导入学生" onClose={onClose} wide><div className="modal-form"><div className="offline-hint"><Upload /><div><b>从 Excel 直接复制</b><span>按“姓名、学号、性别、家长、电话”五列复制后粘贴，无需逐条输入。</span></div></div><label>粘贴表格内容<textarea className="import-area" value={text} onChange={e => setText(e.target.value)} placeholder={'林知夏\t20240101\t女\t林建国\t13800000000\n周予安\t20240102\t男\t周明\t13900000000'} /></label><p className="preview-count">已识别 <b>{rows.length}</b> 行</p><footer><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!rows.length} onClick={() => onImport(rows.map(row => { const [name = '', number = '', gender = '男', guardian = '', phone = ''] = row.split(/\t|,/); return { id: uid('s'), classId, name, number, gender: gender === '女' ? '女' : '男', guardian, phone, tags: [], attendance: 100 } }))}>确认导入</button></footer></div></Modal>
}

function UploadMaterial({ onClose, onSave }: { onClose: () => void; onSave: (m: AppData['materials'][number]) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState('班级管理')
  return <Modal title="导入材料" onClose={onClose}><div className="modal-form"><label className="dropzone"><Upload size={28} /><b>{file ? file.name : '选择本机文件'}</b><span>{file ? `${(file.size / 1024).toFixed(0)} KB` : '支持 Word、Excel、PDF 与图片'}</span><input type="file" onChange={e => setFile(e.target.files?.[0] || null)} /></label><label>归档分类<select value={category} onChange={e => setCategory(e.target.value)}><option>班级管理</option><option>教学资料</option><option>职称评审</option><option>常用模板</option></select></label><div className="privacy-note"><ShieldCheck size={17} />仅保存文件索引，不上传文件内容</div><footer><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!file} onClick={() => file && onSave({ id: uid('m'), name: file.name, category, updated: '刚刚', size: `${(file.size / 1024).toFixed(0)} KB`, starred: false })}>完成归档</button></footer></div></Modal>
}
