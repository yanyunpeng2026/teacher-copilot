import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser'
import {
  Archive, Award, Bell, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown,
  CircleUserRound, ClipboardCheck, Clock3, Download, FileArchive, FileText,
  FolderOpen, GraduationCap, LayoutDashboard, ListTodo, Menu, MoreHorizontal,
  Plus, QrCode, ScanLine, Search, Settings, ShieldCheck, Sparkles, Star,
  Upload, UserPlus, Users, WandSparkles, X
} from 'lucide-react'
import type { AppData, Feedback, Student, Task, Todo } from './types'
import { exportData, loadData, saveData } from './storage'
import { detectSync, fetchFeedback, fetchTask, publishTask, submitFeedback, subscribeFeedback, type SyncState } from './sync'

type Page = 'home' | 'class' | 'todos' | 'tasks' | 'materials' | 'career' | 'documents'
type Toast = { text: string; kind?: 'ok' | 'info' }

const nav = [
  { id: 'home', label: '工作台', icon: LayoutDashboard },
  { id: 'class', label: '班级与学生', icon: Users },
  { id: 'todos', label: '待办与日程', icon: ListTodo },
  { id: 'tasks', label: '扫码任务', icon: QrCode },
  { id: 'materials', label: '材料库', icon: FolderOpen },
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

  if (error) return <div className="student-shell"><div className="student-card"><h1>无法打开任务</h1><p>{error}</p></div></div>
  if (!payload) return <div className="student-shell"><div className="student-card">正在读取任务…</div></div>
  const task = payload.task
  return (
    <div className="student-shell">
      <div className="student-brand"><span className="logo-mark"><BookOpen size={22} /></span><b>知序</b><em>学生任务</em></div>
      <main className="student-card">
        {syncComplete ? (
          <div className="result-card">
            <span className="success-icon pulse-success"><Check size={34} /></span>
            <h1>已自动提交</h1>
            <p>反馈已同步至老师的知序工作台，无需再出示二维码。</p>
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
              <label key={field}>{i + 1}. {field}<input required value={values[field] || ''} onChange={e => setValues({ ...values, [field]: e.target.value })} placeholder={`请填写${field}`} /></label>
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
  const [qrUrl, setQrUrl] = useState('')
  const [sidebar, setSidebar] = useState(false)
  const [sync, setSync] = useState<SyncState>({ connected: false, origin: '', address: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => saveData(data), [data])
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
  const filteredStudents = data.students.filter(s => `${s.name}${s.number}${s.tags.join('')}`.includes(search))

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
        setData(parsed)
        setToast({ text: '本地备份已恢复', kind: 'ok' })
      } catch {
        setToast({ text: '文件格式无法识别' })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const title = nav.find(n => n.id === page)?.label || '工作台'
  return (
    <div className="app">
      <aside className={sidebar ? 'sidebar open' : 'sidebar'}>
        <div className="brand"><span className="logo-mark"><BookOpen size={22} /></span><div><b>知序</b><small>教师工作台</small></div><button aria-label="关闭菜单" className="sidebar-close" onClick={() => setSidebar(false)}><X /></button></div>
        <div className="teacher-mini">
          <div className="avatar">江</div><div><b>江老师</b><span>高一（3）班 · 班主任</span></div><ChevronDown size={16} />
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
      <div className="sidebar-scrim" onClick={() => setSidebar(false)} />
      <main className="main">
        <header className="topbar">
          <button aria-label="打开菜单" className="menu-btn" onClick={() => setSidebar(true)}><Menu /></button>
          <div><span className="eyebrow">2026年7月28日 · 星期二</span><h1>{title}</h1></div>
          <div className="top-actions">
            <div className={`sync-chip ${sync.connected ? 'online' : ''}`}><i />{sync.connected ? '局域网同步中' : '单机模式'}</div>
            <label className="search"><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索学生、材料或待办" /></label>
            <button aria-label="通知" className="icon-btn alert"><Bell size={20} /><i /></button>
            <button className="primary" onClick={() => setModal('quick')}><Plus size={18} />快速新建</button>
          </div>
        </header>

        <div className="content">
          {page === 'home' && <Home data={data} setPage={setPage} updateTodo={updateTodo} onQr={() => setModal('new-task')} />}
          {page === 'class' && <Classroom students={filteredStudents} onAdd={() => setModal('new-student')} onImport={() => setModal('import-students')} />}
          {page === 'todos' && <Todos data={data} updateTodo={updateTodo} onAdd={() => setModal('new-todo')} />}
          {page === 'tasks' && <Tasks data={data} onNew={() => setModal('new-task')} onQr={showTaskQr} onScan={() => setModal('feedback')} />}
          {page === 'materials' && <Materials data={data} setData={setData} onUpload={() => setModal('upload-material')} />}
          {page === 'career' && <Career />}
          {page === 'documents' && <Documents notify={text => setToast({ text, kind: 'ok' })} />}
        </div>
      </main>
      {toast && <div className={`toast ${toast.kind || ''}`}><CheckCircle2 size={18} />{toast.text}</div>}

      {modal === 'quick' && <Modal title="快速新建" onClose={() => setModal(null)}><div className="quick-grid">
        {[['新建待办', ListTodo, 'new-todo'], ['发布扫码任务', QrCode, 'new-task'], ['添加学生', UserPlus, 'new-student'], ['导入材料', Upload, 'upload-material']].map(([label, Icon, key]) => <button key={String(key)} onClick={() => setModal(String(key))}><Icon size={24} /><b>{String(label)}</b><span>立即开始</span></button>)}
      </div></Modal>}

      {modal === 'new-todo' && <NewTodo onClose={() => setModal(null)} onSave={todo => { setData(d => ({ ...d, todos: [todo, ...d.todos] })); setModal(null); setToast({ text: '待办已添加', kind: 'ok' }) }} />}
      {modal === 'new-student' && <NewStudent onClose={() => setModal(null)} onSave={student => { setData(d => ({ ...d, students: [...d.students, student] })); setModal(null); setToast({ text: '学生已加入班级', kind: 'ok' }) }} />}
      {modal === 'new-task' && <NewTask total={data.students.length} onClose={() => setModal(null)} onSave={task => { setData(d => ({ ...d, tasks: [task, ...d.tasks] })); setModal(null); showTaskQr(task) }} />}
      {modal === 'task-qr' && selectedTask && <Modal title="任务发布码" onClose={() => setModal(null)}><div className="qr-panel"><div className="qr-title"><QrCode size={20} /><b>{selectedTask.title}</b></div><img src={qrUrl} alt="任务二维码" /><div className={`qr-sync-state ${sync.connected ? 'online' : ''}`}><span><i />{sync.connected ? '自动回收已开启' : '当前为单机备用模式'}</span><small>{sync.connected ? `学生提交后自动同步至本机 · ${sync.address}` : '启动 Windows 本地服务后可免二次扫码'}</small></div><button className="secondary" onClick={() => { const a = document.createElement('a'); a.href = qrUrl; a.download = `${selectedTask.title}-任务二维码.png`; a.click() }}><Download size={18} />保存二维码</button></div></Modal>}
      {modal === 'feedback' && <FeedbackImport onClose={() => setModal(null)} onImport={feedback => { const exists = data.feedback.some(f => f.id === feedback.id); if (!exists) setData(d => ({ ...d, feedback: [feedback, ...d.feedback], tasks: d.tasks.map(t => t.id === feedback.taskId ? { ...t, completed: Math.min(t.total, t.completed + 1) } : t) })); setModal(null); setToast({ text: exists ? '这份反馈已收录' : `已收录 ${feedback.student} 的反馈`, kind: 'ok' }) }} />}
      {modal === 'settings' && <Modal title="设置与本地备份" onClose={() => setModal(null)}><div className="settings-list"><div><span className="setting-icon"><ShieldCheck /></span><div><b>离线数据模式</b><p>班级、任务与材料索引仅保存在此设备浏览器中。</p></div><em>已开启</em></div><button onClick={() => exportData(data)}><Download size={19} /><span><b>导出完整备份</b><small>保存为加密前的 JSON 数据文件</small></span></button><button onClick={() => fileRef.current?.click()}><Upload size={19} /><span><b>从备份恢复</b><small>导入此前导出的本地文件</small></span></button><input ref={fileRef} hidden type="file" accept=".json" onChange={importBackup} /></div></Modal>}
      {modal === 'import-students' && <ImportStudents onClose={() => setModal(null)} onImport={students => { setData(d => ({ ...d, students: [...d.students, ...students] })); setModal(null); setToast({ text: `已导入 ${students.length} 名学生`, kind: 'ok' }) }} />}
      {modal === 'upload-material' && <UploadMaterial onClose={() => setModal(null)} onSave={material => { setData(d => ({ ...d, materials: [material, ...d.materials] })); setModal(null); setToast({ text: '材料索引已保存', kind: 'ok' }) }} />}
    </div>
  )
}

function Home({ data, setPage, updateTodo, onQr }: { data: AppData; setPage: (p: Page) => void; updateTodo: (id: string) => void; onQr: () => void }) {
  const pending = data.todos.filter(t => !t.done)
  const progress = data.tasks.length ? Math.round(data.tasks[0].completed / data.tasks[0].total * 100) : 0
  return <div className="dashboard">
    <section className="welcome">
      <div><span className="sun">☀</span><h2>下午好，江老师</h2><p>今天有 <b>{pending.length} 项待办</b>，1 项需要优先处理。保持从容，一件件来。</p></div>
      <button className="primary" onClick={onQr}><QrCode size={19} />发布扫码任务</button>
    </section>
    <div className="metrics">
      <article><span className="metric-icon green"><Users /></span><div><small>班级人数</small><strong>{data.students.length}</strong><em>高一（3）班</em></div></article>
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
      <section className="panel schedule"><header><div><h3>今日日程</h3><p>7月28日 · 星期二</p></div><CalendarDays size={21} /></header>
        {[['08:00', '晨会与班级巡视', '高一（3）班'], ['10:10', '数学课 · 函数单调性', '博学楼 302'], ['14:30', '年级组教研会', '行政楼 201'], ['16:00', '提交质量分析', '线上截止']].map((x, i) => <div className={`schedule-row ${i === 2 ? 'now' : ''}`} key={x[0]}><time>{x[0]}</time><i /><div><b>{x[1]}</b><span>{x[2]}</span></div></div>)}
      </section>
      <section className="panel assistant"><div className="assistant-head"><span><Sparkles /></span><div><h3>智能整理建议</h3><p>基于本地资料生成，不上传内容</p></div></div><div className="suggestion"><WandSparkles size={20} /><div><b>职称材料缺少 2 项佐证</b><p>检测到“公开课证明”和“年度考核表”尚未归档。</p></div></div><button className="secondary full" onClick={() => setPage('career')}>去补充材料</button></section>
    </div>
  </div>
}

function TodoRow({ todo, toggle }: { todo: Todo; toggle: () => void }) {
  return <div className={`todo-row ${todo.done ? 'done' : ''}`}><button className="check" onClick={toggle}>{todo.done && <Check size={15} />}</button><div><b>{todo.title}</b><span>{todo.source}</span></div><em className={`priority ${todo.priority}`}>{todo.priority}</em><time><Clock3 size={15} />{todo.date} {todo.time}</time></div>
}

function Classroom({ students, onAdd, onImport }: { students: Student[]; onAdd: () => void; onImport: () => void }) {
  const [view, setView] = useState<'cards' | 'table'>('table')
  return <div className="page-stack"><section className="page-hero compact"><div><span className="section-kicker">CLASS MANAGEMENT</span><h2>高一（3）班</h2><p>学生档案、家校联系和成长记录集中管理</p></div><div className="hero-actions"><button className="secondary" onClick={onImport}><Upload size={18} />表格导入</button><button className="primary" onClick={onAdd}><UserPlus size={18} />添加学生</button></div></section>
    <div className="class-summary"><div><strong>{students.length}</strong><span>学生总数</span></div><div><strong>98.2%</strong><span>本周出勤</span></div><div><strong>6</strong><span>班级干部</span></div><div><strong>3</strong><span>本月生日</span></div><span className="class-view"><button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>列表</button><button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>卡片</button></span></div>
    {students.length === 0 ? <Empty icon={Users} title="没有匹配的学生" text="更换关键词后再试" /> : view === 'table' ? <section className="table-card"><table><thead><tr><th>学生</th><th>学号</th><th>班级角色</th><th>家长</th><th>出勤率</th><th /></tr></thead><tbody>{students.map(s => <tr key={s.id}><td><div className={`student-avatar ${s.gender === '女' ? 'girl' : ''}`}>{s.name.slice(-1)}</div><b>{s.name}</b></td><td>{s.number}</td><td><div className="tags">{s.tags.length ? s.tags.map(t => <span key={t}>{t}</span>) : <i>—</i>}</div></td><td><b className="subtle">{s.guardian}</b><small>{s.phone}</small></td><td><div className="attendance"><i><em style={{ width: `${s.attendance}%` }} /></i><b>{s.attendance}%</b></div></td><td><button className="icon-btn"><MoreHorizontal /></button></td></tr>)}</tbody></table></section> : <div className="student-cards">{students.map(s => <article key={s.id}><div className={`student-avatar big ${s.gender === '女' ? 'girl' : ''}`}>{s.name.slice(-1)}</div><h3>{s.name}</h3><span>{s.number}</span><div className="tags">{s.tags.map(t => <span key={t}>{t}</span>)}</div><footer><span>出勤 <b>{s.attendance}%</b></span><button>查看档案</button></footer></article>)}</div>}
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
  return <div className="page-stack"><section className="page-hero qr-hero"><div><span className="section-kicker">OFFLINE QR WORKFLOW</span><h2>扫码任务中心</h2><p>发布、填写、反馈全程二维码传递，零账号、零云端</p><div className="privacy-pill"><ShieldCheck size={16} />学生隐私不离开设备</div></div><div className="hero-actions"><button className="secondary light" onClick={onScan}><ScanLine size={18} />扫描反馈码</button><button className="primary gold" onClick={onNew}><Plus size={18} />发布新任务</button></div></section>
    <div className="task-layout"><section className="task-list panel"><header><h3>已发布任务</h3><span>{data.tasks.length}</span></header>{data.tasks.map(t => { const pct = Math.round(t.completed / t.total * 100); return <button className={current?.id === t.id ? 'active' : ''} key={t.id} onClick={() => setCurrent(t)}><span className="task-icon"><QrCode /></span><div><b>{t.title}</b><small>{t.audience} · {t.completed}/{t.total} 人</small><i><em style={{ width: `${pct}%` }} /></i></div><strong>{pct}%</strong></button>})}</section>
      <section className="panel task-detail">{current ? <><header><div><span className="status-dot">进行中</span><h3>{current.title}</h3><p>{current.description}</p></div><button className="secondary" onClick={() => onQr(current)}><QrCode size={17} />查看发布码</button></header><div className="task-stats"><div><strong>{current.completed}</strong><span>已回收</span></div><div><strong>{current.total - current.completed}</strong><span>待提交</span></div><div><strong>{Math.round(current.completed / current.total * 100)}%</strong><span>完成率</span></div><div><strong>{current.due.split(' ')[0].slice(5)}</strong><span>截止日期</span></div></div><div className="feedback-head"><h4>最近反馈</h4><button onClick={onScan}><ScanLine size={16} />继续扫码</button></div>{feedback.length ? <div className="feedback-list">{feedback.map(f => <div key={f.id}><div className="student-avatar">{f.student.slice(-1)}</div><div><b>{f.student}</b><span>{f.studentNo} · {f.submitted}</span></div><em><Check size={15} />已收录</em></div>)}</div> : <Empty icon={ClipboardCheck} title="等待第一份反馈" text="扫描学生生成的反馈码后显示在这里" />}</> : <Empty icon={QrCode} title="还没有任务" text="点击右上角发布新任务" />}</section>
    </div>
  </div>
}

function Materials({ data, setData, onUpload }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; onUpload: () => void }) {
  const categories = [...new Set(data.materials.map(m => m.category))]
  const [category, setCategory] = useState('全部')
  const shown = data.materials.filter(m => category === '全部' || m.category === category)
  return <div className="page-stack"><section className="page-hero compact"><div><span className="section-kicker">LOCAL MATERIAL LIBRARY</span><h2>我的材料库</h2><p>按工作场景归档，重要材料一眼找到</p></div><button className="primary" onClick={onUpload}><Upload size={18} />导入材料</button></section><div className="material-layout"><aside className="category-panel panel"><h3>分类</h3>{['全部', ...categories].map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}><FolderOpen size={17} />{c}<span>{c === '全部' ? data.materials.length : data.materials.filter(m => m.category === c).length}</span></button>)}</aside><section className="panel files"><header><h3>{category}</h3><span>{shown.length} 个文件</span></header>{shown.map(m => <div className="file-row" key={m.id}><span className={`file-type ${m.name.endsWith('.pdf') ? 'pdf' : m.name.endsWith('.xlsx') ? 'xls' : ''}`}><FileText /></span><div><b>{m.name}</b><span>{m.category} · {m.size} · {m.updated}</span></div><button className={`icon-btn ${m.starred ? 'starred' : ''}`} onClick={() => setData(d => ({ ...d, materials: d.materials.map(x => x.id === m.id ? { ...x, starred: !x.starred } : x) }))}><Star size={18} /></button><button className="icon-btn"><MoreHorizontal /></button></div>)}</section></div></div>
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

function NewTodo({ onClose, onSave }: { onClose: () => void; onSave: (t: Todo) => void }) {
  const [form, setForm] = useState({ title: '', date: '今天', time: '17:00', priority: '重要' as Todo['priority'], source: '班级事务' })
  return <Modal title="新建待办" onClose={onClose}><form className="modal-form" onSubmit={e => { e.preventDefault(); onSave({ id: uid('t'), ...form, done: false }) }}><label>事项名称<input autoFocus required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例如：收齐家长会回执" /></label><div className="form-grid"><label>日期<select value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}><option>今天</option><option>明天</option><option>本周五</option></select></label><label>时间<input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></label></div><div className="form-grid"><label>优先级<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Todo['priority'] })}><option>紧急</option><option>重要</option><option>普通</option></select></label><label>来源<input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} /></label></div><footer><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary">保存待办</button></footer></form></Modal>
}

function NewStudent({ onClose, onSave }: { onClose: () => void; onSave: (s: Student) => void }) {
  const [form, setForm] = useState({ name: '', number: '', gender: '男' as Student['gender'], phone: '', guardian: '' })
  return <Modal title="添加学生" onClose={onClose}><form className="modal-form" onSubmit={e => { e.preventDefault(); onSave({ id: uid('s'), ...form, tags: [], attendance: 100 }) }}><div className="form-grid"><label>姓名<input required autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>学号<input required value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} /></label></div><div className="form-grid"><label>性别<select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as Student['gender'] })}><option>男</option><option>女</option></select></label><label>家长姓名<input value={form.guardian} onChange={e => setForm({ ...form, guardian: e.target.value })} /></label></div><label>联系电话<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="仅保存在本机" /></label><footer><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary">加入班级</button></footer></form></Modal>
}

function NewTask({ total, onClose, onSave }: { total: number; onClose: () => void; onSave: (t: Task) => void }) {
  const [form, setForm] = useState({ title: '', description: '', due: '2026-07-31 18:00', fields: '是否确认\n备注', audience: '高一（3）班' })
  return <Modal title="发布扫码任务" onClose={onClose} wide><form className="modal-form" onSubmit={e => { e.preventDefault(); onSave({ id: uid('q'), title: form.title, description: form.description, due: form.due, fields: form.fields.split('\n').map(x => x.trim()).filter(Boolean), audience: form.audience, created: new Date().toISOString().slice(0, 10), completed: 0, total }) }}><div className="offline-hint"><QrCode /><div><b>离线二维码任务</b><span>任务内容写入二维码，学生无需登录；反馈通过回传二维码收取。</span></div></div><label>任务标题<input required autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例如：家长会参会确认" /></label><label>说明<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="向学生或家长说明填写要求" /></label><div className="form-grid"><label>发布对象<input value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} /></label><label>截止时间<input value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} /></label></div><label>需要填写的字段 <small>每行一个问题</small><textarea required value={form.fields} onChange={e => setForm({ ...form, fields: e.target.value })} /></label><footer><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary"><QrCode size={17} />生成发布码</button></footer></form></Modal>
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
    } catch { setError('未识别到有效的知序反馈码内容') }
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

function ImportStudents({ onClose, onImport }: { onClose: () => void; onImport: (s: Student[]) => void }) {
  const [text, setText] = useState('')
  const rows = useMemo(() => text.split('\n').map(x => x.trim()).filter(Boolean), [text])
  return <Modal title="批量导入学生" onClose={onClose} wide><div className="modal-form"><div className="offline-hint"><Upload /><div><b>从 Excel 直接复制</b><span>按“姓名、学号、性别、家长、电话”五列复制后粘贴，无需逐条输入。</span></div></div><label>粘贴表格内容<textarea className="import-area" value={text} onChange={e => setText(e.target.value)} placeholder={'林知夏\t20240101\t女\t林建国\t13800000000\n周予安\t20240102\t男\t周明\t13900000000'} /></label><p className="preview-count">已识别 <b>{rows.length}</b> 行</p><footer><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!rows.length} onClick={() => onImport(rows.map(row => { const [name = '', number = '', gender = '男', guardian = '', phone = ''] = row.split(/\t|,/); return { id: uid('s'), name, number, gender: gender === '女' ? '女' : '男', guardian, phone, tags: [], attendance: 100 } }))}>确认导入</button></footer></div></Modal>
}

function UploadMaterial({ onClose, onSave }: { onClose: () => void; onSave: (m: AppData['materials'][number]) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState('班级管理')
  return <Modal title="导入材料" onClose={onClose}><div className="modal-form"><label className="dropzone"><Upload size={28} /><b>{file ? file.name : '选择本机文件'}</b><span>{file ? `${(file.size / 1024).toFixed(0)} KB` : '支持 Word、Excel、PDF 与图片'}</span><input type="file" onChange={e => setFile(e.target.files?.[0] || null)} /></label><label>归档分类<select value={category} onChange={e => setCategory(e.target.value)}><option>班级管理</option><option>教学资料</option><option>职称评审</option><option>常用模板</option></select></label><div className="privacy-note"><ShieldCheck size={17} />仅保存文件索引，不上传文件内容</div><footer><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!file} onClick={() => file && onSave({ id: uid('m'), name: file.name, category, updated: '刚刚', size: `${(file.size / 1024).toFixed(0)} KB`, starred: false })}>完成归档</button></footer></div></Modal>
}
