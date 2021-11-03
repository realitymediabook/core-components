const worldCamera = new THREE.Vector3()
const worldSelf = new THREE.Vector3()

AFRAME.registerComponent('proximity-events', {
  schema: {
    radius: { type: 'number', default: 1 },
    fuzz: { type: 'number', default: 0.1 },
    Yoffset: { type: 'number', default: 0 },
  },
  init() {
    this.inZone = false
    this.camera = this.el.sceneEl.camera
  },
  tick() {
    this.camera.getWorldPosition(worldCamera)
    this.el.object3D.getWorldPosition(worldSelf)
    const wasInzone = this.inZone

    worldCamera.y -= this.data.Yoffset
    var dist = worldCamera.distanceTo(worldSelf)
    var threshold = this.data.radius + (this.inZone ? this.data.fuzz  : 0)
    this.inZone = dist < threshold
    if (this.inZone && !wasInzone) this.el.emit('proximityenter')
    if (!this.inZone && wasInzone) this.el.emit('proximityleave')
  },
})
