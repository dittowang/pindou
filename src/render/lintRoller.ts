import * as THREE from 'three'

/** side of the sticky paper: one perforated tear line per turn, a faint sheen, a few specks */
function tapeTexture(): THREE.CanvasTexture {
  const W = 512, H = 256
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const g = cv.getContext('2d')!
  g.fillStyle = '#f5f2e9'; g.fillRect(0, 0, W, H)
  // adhesive sheen
  const sh = g.createLinearGradient(0, 0, W, 0)
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.25, 'rgba(255,255,255,.45)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(0.75, 'rgba(255,255,255,.3)'); sh.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = sh; g.fillRect(0, 0, W, H)
  // faint grain
  let a = 99
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296 }
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(120,105,80,${rnd() * 0.05})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2) }
  // perforation: a dashed tear line across the sheet, once per turn
  g.fillStyle = 'rgba(90,78,62,.55)'
  for (let y = 4; y < H; y += 9) g.fillRect(W * 0.5 - 1, y, 2, 4.5)
  g.fillStyle = 'rgba(255,255,255,.55)'
  for (let y = 4; y < H; y += 9) g.fillRect(W * 0.5 + 1.5, y, 1.2, 4.5)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** the end of the paper roll: concentric turns of tape */
function rollEndTexture(): THREE.CanvasTexture {
  const N = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = N
  const g = cv.getContext('2d')!
  g.fillStyle = '#ece8dc'; g.fillRect(0, 0, N, N)
  for (let r = N * 0.12; r < N * 0.5; r += 2.2) {
    g.strokeStyle = `rgba(150,138,118,${0.25 + 0.2 * Math.sin(r * 1.7)})`
    g.lineWidth = 0.9
    g.beginPath(); g.arc(N / 2, N / 2, r, 0, Math.PI * 2); g.stroke()
  }
  g.fillStyle = '#cfe2ee'; g.beginPath(); g.arc(N / 2, N / 2, N * 0.12, 0, Math.PI * 2); g.fill()
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Mini tear-off lint roller (粘毛器): a sticky paper drum on a plastic frame with a bent arm and a short grip.
 * Local frame: the drum's axis = z, the arm and grip trail toward −x. Rolling is signed along +x.
 */
export class LintRoller {
  readonly group = new THREE.Group()
  private drum = new THREE.Group()
  private tapeMat: THREE.MeshPhysicalMaterial
  readonly radius = 1.0
  readonly length = 4.6

  constructor() {
    const R = this.radius, L = this.length
    this.tapeMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: tapeTexture(), roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color(0xffffff),
    })
    const endMat = new THREE.MeshStandardMaterial({ map: rollEndTexture(), roughness: 0.8 })
    const plastic = new THREE.MeshPhysicalMaterial({ color: 0x9cc7dc, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 })
    const grip = new THREE.MeshPhysicalMaterial({ color: 0xb7d6e6, roughness: 0.52, clearcoat: 0.25 })
    const band = new THREE.MeshPhysicalMaterial({ color: 0x5f93b3, roughness: 0.5, clearcoat: 0.3 })
    const steel = new THREE.MeshStandardMaterial({ color: 0xc4c8ce, metalness: 0.95, roughness: 0.28 })

    // paper drum (axis z)
    const side = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 56, 1, false), [this.tapeMat, endMat, endMat])
    side.rotation.x = Math.PI / 2
    side.castShadow = true
    this.drum.add(side)
    this.group.add(this.drum)
    // plastic flanges at both ends hold the roll
    for (const s of [-1, 1]) {
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.09, 40), plastic)
      fl.rotation.x = Math.PI / 2
      fl.position.z = s * (L / 2 + 0.045)
      fl.castShadow = true
      this.group.add(fl)
    }
    // axle and the arm that bends away to the grip
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, L + 0.9, 10), steel)
    axle.rotation.x = Math.PI / 2
    axle.position.z = 0.25
    this.group.add(axle)
    const arm = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, L / 2 + 0.35), new THREE.Vector3(0, 0.04, L / 2 + 0.72), new THREE.Vector3(-0.55, 0.45, L / 2 + 0.86),
      new THREE.Vector3(-1.8, 1.0, L / 2 + 0.86), new THREE.Vector3(-3.1, 1.28, L / 2 + 0.86),
    ])
    const armMesh = new THREE.Mesh(new THREE.TubeGeometry(arm, 24, 0.13, 10, false), steel)
    armMesh.castShadow = true
    this.group.add(armMesh)
    // grip: slightly tilted up, with a darker band
    const gripMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 3.3, 8, 18), grip)
    gripMesh.rotation.z = Math.PI / 2 + 0.1
    gripMesh.position.set(-5.0, 1.55, L / 2 + 0.86)
    gripMesh.castShadow = true
    this.group.add(gripMesh)
    const bandMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.475, 0.475, 0.34, 24), band)
    bandMesh.rotation.z = Math.PI / 2 + 0.1
    bandMesh.position.set(-3.55, 1.4, L / 2 + 0.86)
    this.group.add(bandMesh)
    this.group.name = 'lintRoller'
  }

  /** roll the drum by a signed travelled distance (cm) along +x */
  roll(dist: number) { this.drum.rotation.z -= dist / this.radius }

  /** 0 = fresh sheet … 1 = grey with fluff: the tape picks the lint up, and you can see it */
  setDirt(f: number) {
    const k = Math.min(1, Math.max(0, f))
    this.tapeMat.color.setRGB(1 - 0.2 * k, 1 - 0.22 * k, 1 - 0.28 * k)
    this.tapeMat.roughness = 0.5 + 0.35 * k
    this.tapeMat.clearcoat = 0.35 * (1 - 0.7 * k)
  }
}
