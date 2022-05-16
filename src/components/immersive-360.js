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

// simple hack to get position of pano media aligned with camera.
// Systems are updated after components, so we do the final alignment
// with the camera after all the components are updated.
AFRAME.registerSystem('immersive-360', {
  init: function () {
    this.updateThis = null;
  },
  updatePosition(component) {
    // TODO:  add this to a queue, and process the queue in tick()
    this.updateThis = component;
  },

  tick: function () {
    // TODO: process the queue, popping everything off the queue when we are done
    if (this.updateThis) {
      if (window.APP.scene.is("vr-mode")) {
        this.updateThis.mesh.position.set(0,0,0);
        let radius = this.updateThis.data.radius;
        this.updateThis.mesh.scale.set(10+radius,10+radius,10+radius);
      } else {
        ///let cam = document.getElementById("viewing-camera").object3DMap.camera;
        this.updateThis.el.sceneEl.camera.updateMatrices();
        this.updateThis.el.sceneEl.camera.getWorldPosition(worldCamera)
        this.updateThis.el.object3D.worldToLocal(worldCamera)
        this.updateThis.mesh.position.copy(worldCamera)
        this.updateThis.mesh.scale.set(1,1,1);
      }
      this.updateThis.mesh.matrixNeedsUpdate = true;
      this.updateThis.mesh.updateWorldMatrix(true, false)

      this.updateThis = null;
    }
  },

})
AFRAME.registerComponent('immersive-360', {
  schema: {
    url: { type: 'string', default: null },
    radius: { type: 'number', default: 0.15 },
  },

  init: async function () {
    this.system = window.APP.scene.systems['immersive-360']

    var url = this.data.url
    if (!url || url == "") {
        url = this.parseSpokeName()
    }
    
    const extension = url.match(/^.*\.(.*)$/)[1]

    // set up the local content and hook it to the scene
    this.pano = document.createElement('a-entity')
    // media-image will set up the sphere geometry for us
    this.pano.setAttribute('media-image', {
      projection: '360-equirectangular',
      alphaMode: 'opaque',
      src: url,
      version: 1,
      batch: false,
      contentType: `image/${extension}`,
      alphaCutoff: 0,
    })
   // this.pano.object3D.position.y = 1.6
    this.el.appendChild(this.pano)

    // but we need to wait for this to happen
    this.mesh = await this.getMesh()
    this.mesh.matrixAutoUpdate = true
    this.mesh.updateWorldMatrix(true, false)

    var ball = new THREE.Mesh(
        new THREE.SphereBufferGeometry(this.data.radius, 30, 20),
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
   
    // get the pano oriented properly in the room relative to the way media-image is oriented
    ball.rotation.set(Math.PI, Math.PI, 0);

    ball.userData.floatY = (this.data.radius > 1.5 ? this.data.radius + 0.1 : 1.6);
    ball.userData.selected = 0;
    ball.userData.timeOffset = (Math.random()+0.5) * 10
    this.ball = ball
    this.el.setObject3D("ball", ball)

    //this.mesh.geometry.scale(2, 2, 2)
    this.mesh.material.setValues({
      transparent: true,
      depthTest: false,
    })
    this.mesh.visible = false
    
    this.near = this.data.radius - 0;
    this.far = this.data.radius + 0.05;

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
      let offset = Math.cos((time + this.ball.userData.timeOffset)/1000 * 3 ) * 0.02;
      this.ball.position.y = this.ball.userData.floatY + offset
      this.ball.matrixNeedsUpdate = true;

      this.ball.material.uniforms.texfx.value = ballTex
      this.ball.material.uniforms.ballTime.value = time * 0.001 + this.ball.userData.timeOffset
      // Linearly map camera distance to material opacity
      this.ball.getWorldPosition(worldSelf)
      this.el.sceneEl.camera.getWorldPosition(worldCamera)
      const distance = worldSelf.distanceTo(worldCamera)
      const opacity = 1 - (distance - this.near) / (this.far - this.near)
      if (opacity < 0) {
          // far away
          if (this.mesh.visible) {
            // we were inside
            if (this.maxopacity == 1) {
              window.APP.scene.systems["data-logging"].logPanoballExited(this.el.object3D.name);
            }
            this.maxopacity = 0;
          }
          this.mesh.visible = false
          this.mesh.material.opacity = 0
          this.ball.material.opacity = 0.5;
        } else {
          this.mesh.material.opacity = opacity > 1 ? 1 : opacity
          this.mesh.visible = true
          if (this.maxopacity < 1 && this.mesh.material.opacity == 1) {
            window.APP.scene.systems["data-logging"].logPanoballEntered(this.el.object3D.name);
          }
          this.ball.material.opacity = 1 - this.mesh.material.opacity

          this.maxopacity = Math.max(this.maxopacity, this.mesh.material.opacity);
          // position the mesh around user until they leave the ball
          // this.el.object3D.worldToLocal(worldCamera)
          // this.mesh.position.copy(worldCamera)
          
          // this.el.object3D.getWorldPosition(worldSelf)
          // worldSelf.y += this.ball.userData.floatY;

          // worldSelf.sub(worldCamera)
          // this.mesh.position.copy(worldSelf)
          this.system.updatePosition(this);
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
      const mesh = this.pano.object3DMap.mesh
      if (mesh) resolve(mesh)
      this.pano.addEventListener(
        'image-loaded',
        () => {
            console.log("immersive-360 pano loaded: " + this.data.url)
          resolve(this.pano.object3DMap.mesh)
        },
        { once: true }
      )
    })
  },
})
