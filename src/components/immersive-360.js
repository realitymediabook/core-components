/**
 * Description
 * ===========
 * 360 image that fills the user's vision when in a close proximity.
 *
 * Usage
 * =======
 * Given a 360 image asset with the following URL in Spoke:
 * https://gt-ael-aq-assets.aelatgt-internal.net/files/12345abc-6789def.jpg
 *
 * The name of the `immersive-360.glb` instance in the scene should be:
 * "some-descriptive-label__12345abc-6789def_jpg" OR "12345abc-6789def_jpg"
 */


// TODO: 
// - adjust size of pano ball
// - drop on video or image and pull video/image from that media location
// - intercept mouse input somehow?    Not sure if it's possible.


import ballfx from '../assets/ballfx.png'
import panovert from '../shaders/panoball.vert'
import panofrag from '../shaders/panoball.frag'

const worldCamera = new THREE.Vector3()
const worldSelf = new THREE.Vector3()

const loader = new THREE.TextureLoader()
var ballTex = null
loader.load(ballfx, (ball) => {
    ball.minFilter = THREE.NearestFilter;
    ball.magFilter = THREE.NearestFilter;
    ball.wrapS = THREE.RepeatWrapping;
    ball.wrapT = THREE.RepeatWrapping;
    ballTex = ball
})

AFRAME.registerComponent('immersive-360', {
  schema: {
    url: { type: 'string', default: null },
  },
  init: async function () {
    var url = this.data.url
    if (!url || url == "") {
        url = this.parseSpokeName()
    }
    
    const extension = url.match(/^.*\.(.*)$/)[1]

    // media-image will set up the sphere geometry for us
    this.el.setAttribute('media-image', {
      projection: '360-equirectangular',
      alphaMode: 'opaque',
      src: url,
      version: 1,
      batch: false,
      contentType: `image/${extension}`,
      alphaCutoff: 0,
    })
    // but we need to wait for this to happen
    this.mesh = await this.getMesh()

    var ball = new THREE.Mesh(
        new THREE.SphereBufferGeometry(0.15, 30, 20),
        new THREE.ShaderMaterial({
            uniforms: {
              panotex: {value: this.mesh.material.map},
              texfx: {value: ballTex},
              selected: {value: 0},
              ballTime: {value: 0}
            },
            vertexShader: panovert,
            fragmentShader: panofrag,
            side: THREE.BackSide,
          })
    )
   
    ball.rotation.set(Math.PI, 0, 0);
    ball.position.copy(this.mesh.position);
    ball.userData.floatY = this.mesh.position.y + 0.6;
    ball.userData.selected = 0;
    ball.userData.timeOffset = (Math.random()+0.5) * 10
    this.ball = ball
    this.el.setObject3D("ball", ball)

    this.mesh.geometry.scale(100, 100, 100)
    this.mesh.material.setValues({
      transparent: true,
      depthTest: false,
    })
    this.mesh.visible = false

    this.near = 0.8
    this.far = 1.1

    // Render OVER the scene but UNDER the cursor
    this.mesh.renderOrder = APP.RENDER_ORDER.CURSOR - 0.1
  },
  remove: function() {
    this.ball.geometry.dispose()
    this.ball.geometry = null
    this.ball.material.dispose()
    this.ball.material = null
    this.el.removeObject3D("ball")
    this.ball = null
  },
  tick: function (time) {
    if (this.mesh && ballTex) {
      this.ball.position.y = this.ball.userData.floatY + Math.cos((time + this.ball.userData.timeOffset)/1000 * 3 ) * 0.02;
      this.ball.matrixNeedsUpdate = true;

      this.ball.material.uniforms.texfx.value = ballTex
      this.ball.material.uniforms.ballTime.value = time * 0.001 + this.ball.userData.timeOffset
      // Linearly map camera distance to material opacity
      this.mesh.getWorldPosition(worldSelf)
      this.el.sceneEl.camera.getWorldPosition(worldCamera)
      const distance = worldSelf.distanceTo(worldCamera)
      const opacity = 1 - (distance - this.near) / (this.far - this.near)
      if (opacity < 0) {
          // far away
          this.mesh.visible = false
          this.mesh.material.opacity = 1
          this.ball.material.opacity = 1
        } else {
            this.mesh.material.opacity = opacity > 1 ? 1 : opacity
            this.mesh.visible = true
            this.ball.material.opacity = this.mesh.material.opacity
        }
    }
  },
  parseSpokeName: function () {
    // Accepted names: "label__image-hash_ext" OR "image-hash_ext"
    const spokeName = this.el.parentEl.parentEl.className
    const matches = spokeName.match(/(?:.*__)?(.*)_(.*)/)
    if (!matches || matches.length < 3) { return "" }
    const [, hash, extension]  = matches
    const url = `https://resources.realitymedia.digital/data/${hash}.${extension}`
    return url
  },
  getMesh: async function () {
    return new Promise((resolve) => {
      const mesh = this.el.object3DMap.mesh
      if (mesh) resolve(mesh)
      this.el.addEventListener(
        'image-loaded',
        () => {
            console.log("immersive-360 pano loaded: " + this.data.url)
          resolve(this.el.object3DMap.mesh)
        },
        { once: true }
      )
    })
  },
})
