import * as THREE from 'three'

/**
 * A procedural craft-studio environment for image-based lighting.
 * A big soft window on the left (the main specular glint on plastic and steel),
 * a ceiling softbox, a cool fill on the right and a warm wooden floor bounce.
 * No HDRI file → nothing to download, and the reflections are tunable.
 */
export function buildStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene()
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(60, 30, 60),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.20, 0.19, 0.18), side: THREE.BackSide }),
  )
  scene.add(room)

  const emit = (w: number, h: number, color: THREE.ColorRepresentation, intensity: number) => {
    const c = new THREE.Color(color).multiplyScalar(intensity)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, toneMapped: false }))
    return m
  }

  // window (key): left, high, slightly in front
  const win = emit(16, 11, 0xfff0dc, 9)
  win.position.set(-26, 8, 3)
  win.rotation.y = Math.PI / 2
  scene.add(win)
  // window mullions (dark bars) — gives the characteristic window-shaped glint
  const barMat = new THREE.MeshBasicMaterial({ color: 0x1b1814 })
  for (const dy of [0]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 11), barMat)
    bar.position.set(-25.9, 8 + dy, 3)
    bar.rotation.y = Math.PI / 2
    scene.add(bar)
  }
  const bar2 = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.5), barMat)
  bar2.position.set(-25.9, 8, 3)
  bar2.rotation.y = Math.PI / 2
  scene.add(bar2)

  // ceiling softbox
  const top = emit(12, 12, 0xfff6ea, 4.2)
  top.position.set(2, 14.5, -2)
  top.rotation.x = Math.PI / 2
  scene.add(top)
  // cool fill, right
  const fill = emit(18, 10, 0xdce8ff, 1.15)
  fill.position.set(26, 5, 4)
  fill.rotation.y = -Math.PI / 2
  scene.add(fill)
  // rear wall bounce, warm
  const back = emit(30, 10, 0xffe6c8, 0.9)
  back.position.set(0, 3, -27)
  scene.add(back)
  // floor bounce (warm wood)
  const floor = emit(60, 60, 0xb98a5a, 0.55)
  floor.position.set(0, -14.8, 0)
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  // a few small hot points: lamp bulbs → crisp pinpoint glints on steel / glossy melt
  for (const [x, y, z, i] of [[10, 12, 10, 40], [-8, 13, -8, 25]] as const) {
    const b = emit(1.1, 1.1, 0xfff1d6, i)
    b.position.set(x, y, z)
    b.lookAt(0, 0, 0)
    scene.add(b)
  }

  const pmrem = new THREE.PMREMGenerator(renderer)
  const rt = pmrem.fromScene(scene, 0.035, 0.1, 200)
  pmrem.dispose()
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as THREE.Material | undefined
    if (mat) mat.dispose()
  })
  return rt.texture
}
