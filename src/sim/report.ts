import type { Outcome } from '../interact/iron'
import type { BuildStats } from '../interact/build'
import { COVERS } from '../render/paper'

export interface Finding {
  id: string
  /** what the community calls it */
  name: string
  slang?: string
  sev: 1 | 2 | 3
  /** how it shows up on the piece */
  what: string
  /** physical cause */
  why: string
  /** what a veteran would do (处方) */
  fix: string
}

export interface PieceMetrics { count: number; closedShare: number; openShare: number; thickSd: number; edgeBurnShare: number; bleedShare: number; yellowed: number; residueShare: number }
export interface BuildSummary { wrong: number; missing: number; extra: number; total: number }

export interface Diagnosis {
  grade: 'S' | 'A' | 'B' | 'C' | 'D'
  title: string
  verdict: string
  findings: Finding[]
  praise: string[]
  /** a fingerprint-like line: no two pieces share it */
  tag: string
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/**
 * 赛博义诊: read the physical record of one piece and say, kindly and a little drily, what happened to it.
 * Every finding is a real failure mode from the shop/community research (docs/research/offline-flow.md §3).
 */
export function diagnose(o: Outcome, m: PieceMetrics, b: BuildStats, build: BuildSummary | null, pressure: number): Diagnosis {
  const f: Finding[] = []
  const add = (x: Finding) => f.push(x)
  const front = o.front, back = o.back
  const flat = o.mode === 'flat'

  if (build && (build.wrong + build.missing) > 0) {
    const n = build.wrong + build.missing
    add({ id: 'mismatch', name: '拼错 / 漏拼', slang: '看串行了', sev: n > 12 ? 3 : n > 4 ? 2 : 1,
      what: `${build.wrong ? `${build.wrong} 颗颜色和图纸对不上` : ''}${build.wrong && build.missing ? '，' : ''}${build.missing ? `${build.missing} 个位置空着` : ''}。`,
      why: '相邻的行看串了，或者相近色（白/奶白、黑/深灰）在盒子里分不出来。熨烫不可逆，错的颜色就被烫进去了。',
      fix: '下次每拼完 5 行退远看一眼；备豆时把相近色放远一点；烫之前一定对一遍图。' })
  }
  if (b.misseated - b.reseated > 2) {
    add({ id: 'perched', name: '豆没插到底', slang: '站在钉尖上', sev: 1,
      what: `大约 ${b.misseated - b.reseated} 颗豆没有落到底，歪着或半截站在钉子上。`,
      why: '镊子不垂直、四周挤得太紧，或者落点偏了几分之一毫米。烫的时候它们会斜着熔进去。',
      fix: '拼完用镊子尖轻轻点一下每颗豆，或者把板子倾斜 30–45° 轻敲背面，让豆子靠齐。' })
  }
  const under = Math.max(front?.underShare ?? 0, back?.underShare ?? 0)
  if (o.leftOnBoard + o.lostWithPaper > 0 || under > 0.2) {
    const n = o.leftOnBoard + o.lostWithPaper
    add({ id: 'underfuse', name: '烫不透', slang: '烫不实', sev: n > 20 || under > 0.5 ? 3 : n > 5 ? 2 : 1,
      what: n ? `脱板时掉了 ${n} 颗豆，没粘牢的地方一碰就散。` : '有些地方孔洞还大大地开着，没真正粘住。',
      why: '热量没到位：时间短、温度低，或者熨斗只在中间画圈、边缘没扫到。熔点之前再久也没用。',
      fix: '边缘多停 2–3 秒；每个点按 3–6 秒再换位置；对着光看，透光的小孔就是没烫透的地方，局部补烫。' })
  }
  if (flat && o.transferLost > 0) {
    add({ id: 'transfer', name: '转印掉豆', slang: '粘不牢', sev: o.transferLost > 14 ? 3 : o.transferLost > 4 ? 2 : 1,
      what: `翻转脱板的时候，有 ${o.transferLost} 颗豆没粘在美纹纸上，留在了板子上。`,
      why: '美纹纸没压牢——中间压到了、边缘和单颗的豆最容易漏。纸一贴上去就要一次到位，没粘上的豆一翻面就掉。',
      fix: '「3-2-1，快准狠」一次贴准；用滚筒 / 豆铲从中间往边缘压，边缘多压几遍；脱板前先翻面轻轻敲一敲，看有没有松的。' })
  }
  if (flat && o.tapeGlue > 0.3) {
    add({ id: 'tapeglue', name: '胶残留', slang: '粘胶', sev: o.tapeGlue > 0.7 ? 3 : 2,
      what: '撕掉美纹纸后，表面有一层发亮发粘的胶印，沾灰就黑。',
      why: '熨斗太烫、停得太久，或者纸还热着就撕——美纹纸的胶被烫软，渗进了豆子表面。',
      fix: '降一档；等凉透再撕；残胶可以用洗洁精和软布擦掉，别用酒精泡。' })
  }
  if (o.isolated > 0 && !flat) {
    add({ id: 'isolated', name: '孤立豆', slang: '一烫就掉', sev: 1,
      what: `${o.isolated} 颗豆周围没有邻居，脱板时直接掉了。`,
      why: '没有邻居，就没有熔合的面可以粘。一格宽的细线条也最容易断。',
      fix: '设计图纸时把单格点缀加粗，或者围一圈废豆保护边缘。' })
  }
  const burnt = Math.max(front?.burntShare ?? 0, back?.burntShare ?? 0)
  const over = Math.max(front?.overShare ?? 0, back?.overShare ?? 0)
  if (burnt > 0.04 || (m.closedShare > 0.6 && !flat)) {
    add({ id: 'overmelt', name: '烫过头', slang: '烫到火葬场', sev: burnt > 0.25 ? 3 : burnt > 0.08 ? 2 : 1,
      what: '孔洞全没了，表面发亮像一整片塑料，颗粒质感消失；有的地方颜色变深甚至发黄。',
      why: '温度高或者停留久。孔洞开始闭合的时候就该降温——过了这一步不可逆。',
      fix: '先在边角用废豆试一块；每点停 3–6 秒就换位置；下次降一档，或者给纸多垫一层。' })
  } else if (over > 0.35 && !flat) {
    add({ id: 'smooth', name: '无孔光面', slang: '闷豆风', sev: 1,
      what: '大部分孔洞闭合，正面像一整块平滑的塑料片。',
      why: '烫得比较透。如果你本来就想要无孔效果，这其实是对的。',
      fix: '想保留颗粒感，就在孔洞缩到一半时停手。' })
  }
  if (m.edgeBurnShare > 0.3) {
    add({ id: 'edgemelt', name: '熔边', slang: '炸边', sev: 1,
      what: '图案外圈的豆被烫得外溢，形成毛糙的薄边。',
      why: '边缘没有邻居分担热量，反复被熨斗扫到就过熔。',
      fix: '图案周围用废豆围一圈，与主体隔两个钉；边缘宁可轻一点。' })
  }
  if (m.bleedShare > 0.3 && pressure > 0.55) {
    add({ id: 'bleed', name: '晕色', slang: '串色', sev: pressure > 0.8 ? 2 : 1,
      what: '色块边缘互相洇开，线条不再利落。',
      why: '软化期的豆子被你压得太用力，塑料侧向流动，颜色跟着混。',
      fix: '用熨斗自重就够了；先点按，别一上来就拖。' })
  }
  if (m.thickSd > 0.085 && m.openShare > 0.05) {
    add({ id: 'uneven', name: '高低不平', slang: '高低豆', sev: m.thickSd > 0.14 ? 2 : 1,
      what: '表面起伏：有的地方烫成了方块，有的还是圆管，孔洞大小不一。',
      why: '受热不均——熨斗只照顾了一部分，或者纸起了皱，让一部分豆没接触到。',
      fix: '勤换位置和朝向；先烫平纸再盖；整体多走一遍，别漏角落。' })
  }
  if (o.maxDwell > 7.5) {
    add({ id: 'ironprint', name: '熨斗印', slang: '局部过熔', sev: o.maxDwell > 11 ? 2 : 1,
      what: '熨斗某个位置停得太久，那一块比周围亮、薄。',
      why: '同一点停留过久，热量积在塑料里。',
      fix: '不要一个点按到天荒地老；先贴合，再轻轻上下左右滑动让温度均匀。' })
  }
  if (o.pegsMelted > 0 || o.stuckToBoard > 0) {
    add({ id: 'pegmelt', name: '烫到板子', slang: '豆焊在板上', sev: o.stuckToBoard > 3 ? 3 : 2,
      what: `${o.stuckToBoard ? `${o.stuckToBoard} 颗豆焊在了钉子上取不下来，` : ''}豆板的钉子被烫软了。`,
      why: '熨斗停在板上太久（或者直接压在没豆子的区域），塑料钉软化后和豆子粘在一起。',
      fix: '图案以外别熨；板子下面垫大理石；大图用美纹纸让豆子离板再烫。' })
  }
  if ((o.hotPeel.front > 0.3 || o.hotPeel.back > 0.3)) {
    add({ id: 'hotpeel', name: '撕太早', slang: '趁热撕', sev: Math.max(o.hotPeel.front, o.hotPeel.back) > 0.7 ? 3 : 2,
      what: '纸还没凉透就揭了，豆子被扯得变形、拉丝，纸上粘着豆。',
      why: '热的豆子是软的。揭得越早，粘得越牢。',
      fix: '等到不烫手再揭：扇风、湿巾擦纸面 20–30 秒、铁块压一下都能加速降温。（毛巾烫是例外，要趁热撕。）' })
  }
  if (m.residueShare > 0.1) {
    add({ id: 'scraps', name: '粘纸 / 纸屑', slang: '搓泥', sev: 2,
      what: '表面粘着一层白色的纸屑。',
      why: `${COVERS[o.cover].zh}被熔化的豆子焊住了——温度太高，或者撕得太热。`,
      fix: '换新的纸；降温再撕；换更耐烫的烘焙布。' })
  }
  if (o.lintMarked > 0) {
    add({ id: 'lint', name: '毛发 / 灰尘', slang: '烫进去了', sev: o.lintMarked > 6 ? 2 : 1,
      what: `表面有 ${o.lintMarked} 处细小的毛发或黑点被烫了进去。`,
      why: '纸上的浮毛没粘干净，一压就嵌进软化的塑料里，抠不出来。',
      fix: '熨烫前用粘毛器把纸的两面都粘一遍；板子也先刷一刷。' })
  }
  if (o.fragments > 1) {
    add({ id: 'broken', name: '断成几块', slang: '散架', sev: 3,
      what: `作品断成了 ${o.fragments} 块。`,
      why: '连接处没烫牢，或者一两格宽的细结构承不住脱板的拉力。',
      fix: '补烫连接处；设计时加粗细线条；脱板动作再轻一点。' })
  }
  if (o.warp > 0.22) {
    add({ id: 'warp', name: '翘边', slang: '做卷腹', sev: o.warp > 0.55 ? 3 : o.warp > 0.35 ? 2 : 1,
      what: '放凉后边缘上翘、整体拱起像一片薯片。',
      why: '塑料冷却时不均匀收缩——烫得更透的那一面收缩更多；只烫一面、边缘熔得比中间多，翘得更厉害。根本原因是冷却时没人管它。',
      fix: '复烫：背面朝上盖布轻扫 5–8 秒让它回软，立刻压上书压平 15 分钟。别学网上的开水泡。' })
  }
  if (m.yellowed > 0) {
    add({ id: 'yellow', name: '白豆变黄', slang: '黄脸 Kitty', sev: 1,
      what: '白色的豆子泛了黄。',
      why: '温度太高，豆子里的材料氧化——常温放久也会慢慢变黄。',
      fix: '没有好的办法。可以把发黄的白豆当成奶油黄来用。' })
  }

  f.sort((a, b2) => b2.sev - a.sev)
  const score = f.reduce((s, x) => s + (x.sev === 3 ? 3.2 : x.sev === 2 ? 1.6 : 0.6), 0)
  const praise: string[] = []
  if (flat) {
    if (m.closedShare > 0.8 && burnt < 0.04) praise.push('无孔烫得很干净——孔全合上了，也没有烫黄。')
    if (!o.transferLost) praise.push('转印一颗没掉，美纹纸贴得又准又牢。')
  } else if (!f.some((x) => x.id === 'underfuse' || x.id === 'overmelt')) praise.push('火候刚刚好——孔洞缩到一半附近，是最耐看的样子。')
  if (o.warp < 0.12) praise.push('压得很平，放着不会卷。')
  if (!o.lintMarked && !o.lintLeft) praise.push('粘毛做得干净，表面没有一根毛。')
  if (b.dropped > 0 && b.misseated === 0) praise.push('每一颗都落在了钉上，手很稳。')
  if (m.thickSd < 0.05 && m.count > 20) praise.push('受热很均匀，表面平整。')

  let grade: Diagnosis['grade'] = 'S', title = '教科书级', verdict = '几乎没有毛病——这一件可以直接当样板间。'
  if (score >= 9) { grade = 'D'; title = '烫到火葬场'; verdict = '翻车得很彻底。别急着扔——它很有可能被义诊救回来，而且这种作品往往最有故事。' }
  else if (score >= 5) { grade = 'C'; title = '翻车大赏'; verdict = '好几处问题。不过圈子里有句话：完美的拼豆好看，翻车的拼豆更好看。' }
  else if (score >= 2.4) { grade = 'B'; title = '合格的手作'; verdict = '有一点小瑕疵，不对比看不出来——这才是亲手做的样子。' }
  else if (score >= 0.7) { grade = 'A'; title = '很稳的新手'; verdict = '只有一两处小毛病，整体漂亮。' }
  const tag = `${flat ? '无孔转印 · ' : ''}熨 ${o.dial === 'low' ? '低' : o.dial === 'mid' ? '中' : '高'}温 · ${COVERS[o.cover].zh} · ${o.pressed === 'book' ? '书压' : o.pressed === 'tile' ? '砖压' : '未压'}`
  return { grade, title, verdict, findings: f, praise, tag }
}
