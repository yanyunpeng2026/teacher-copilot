import type { AppData } from './types'

export const initialData: AppData = {
  profile: {
    name: '江老师',
    school: '明德中学',
    title: '班主任',
    subject: '数学',
    phone: '',
    motto: '先照顾好自己，再从容照顾每一个孩子'
  },
  classes: [
    { id: 'c1', name: '高一（3）班', role: '班主任', subject: '数学', studentCount: 45, room: '博学楼 302', next: '班会 · 周五 15:30' },
    { id: 'c2', name: '高一（1）班', role: '任课教师', subject: '数学', studentCount: 45, room: '博学楼 301', next: '下节课 · 10:10' },
    { id: 'c3', name: '高一（2）班', role: '任课教师', subject: '数学', studentCount: 44, room: '博学楼 303', next: '明天 · 08:00' }
  ],
  directories: ['班级管理', '教学资料', '职称评审', '常用模板'],
  students: [
    { id: 's1', name: '林知夏', number: '20240101', gender: '女', phone: '138****2190', guardian: '林建国', tags: ['班长', '语文课代表'], attendance: 98, },
    { id: 's2', name: '周予安', number: '20240102', gender: '男', phone: '139****7041', guardian: '周明', tags: ['数学课代表'], attendance: 96 },
    { id: 's3', name: '陈屿', number: '20240103', gender: '男', phone: '137****6308', guardian: '陈海', tags: ['体育委员'], attendance: 92 },
    { id: 's4', name: '沈乐言', number: '20240104', gender: '女', phone: '136****9822', guardian: '沈静', tags: ['宣传委员'], attendance: 99 },
    { id: 's5', name: '顾一诺', number: '20240105', gender: '女', phone: '135****1226', guardian: '顾诚', tags: ['英语课代表'], attendance: 97 },
    { id: 's6', name: '许嘉树', number: '20240106', gender: '男', phone: '188****5603', guardian: '许文', tags: [], attendance: 95 }
  ],
  todos: [
    { id: 't1', title: '提交期中质量分析', date: '今天', time: '16:00', priority: '紧急', done: false, source: '教务处' },
    { id: 't2', title: '确认春游家长回执', date: '今天', time: '18:00', priority: '重要', done: false, source: '班级事务' },
    { id: 't3', title: '整理职称评审课堂实录', date: '明天', time: '12:00', priority: '重要', done: false, source: '职称材料' },
    { id: 't4', title: '备课：函数单调性', date: '周四', time: '08:00', priority: '普通', done: false, source: '教学' }
  ],
  materials: [
    { id: 'm1', name: '2025-2026学年班主任工作计划.docx', category: '班级管理', updated: '今天 09:42', size: '1.2 MB', starred: true },
    { id: 'm2', name: '高级教师职称申报材料清单.xlsx', category: '职称评审', updated: '昨天 16:18', size: '684 KB', starred: true },
    { id: 'm3', name: '公开课教学设计—函数单调性.pdf', category: '教学资料', updated: '7月24日', size: '3.8 MB', starred: false },
    { id: 'm4', name: '家校沟通记录模板.docx', category: '常用模板', updated: '7月21日', size: '92 KB', starred: false }
  ],
  tasks: [
    { id: 'q1', kind: '信息收集', title: '春游意向与健康信息确认', description: '请学生与家长共同核对并提交，信息仅保存在班主任设备。', due: '2026-07-30 20:00', fields: ['是否参加', '紧急联系人', '饮食禁忌'], audience: '高一（3）班', created: '2026-07-28', completed: 36, total: 45 },
    { id: 'q2', kind: '接龙报名', title: '暑期家访时间征集', description: '请选择方便家访的时间段。', due: '2026-08-02 18:00', fields: ['首选时间', '备选时间', '家庭地址确认'], audience: '高一（3）班', created: '2026-07-27', completed: 29, total: 45 }
  ],
  feedback: [
    { id: 'f1', taskId: 'q1', student: '林知夏', studentNo: '20240101', submitted: '今天 09:31', values: { '是否参加': '是', '紧急联系人': '林建国 138****2190', '饮食禁忌': '无' } },
    { id: 'f2', taskId: 'q1', student: '周予安', studentNo: '20240102', submitted: '今天 09:18', values: { '是否参加': '是', '紧急联系人': '周明 139****7041', '饮食禁忌': '花生过敏' } }
  ]
}
