/**
 * Description
 * ===========
 * Create a mirror in the scene
 *
 */
import {
    staticComponentTemplate
} from "../utils/staticComponent.js";

// the componentName must be lowercase, can have hyphens, start with a letter, 
// but no underscores
let componentName = "mirror";

// get the template part of the object need for the AFRAME component
let template = staticComponentTemplate(componentName);

const MIRROR_FPS = 300;
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 1024;
const BASE_COLOR = 0x7f7f7f;

// from layer.js in hubs
const CAMERA_LAYER_VIDEO_TEXTURE_TARGET = 6;

 
const clipBias = 0;
    
const reflectorPlane = new THREE.Plane();
const normal = new THREE.Vector3();
const reflectorWorldPosition = new THREE.Vector3();
const cameraWorldPosition = new THREE.Vector3();
const rotationMatrix = new THREE.Matrix4();
rotationMatrix.autoUpdate = true;
const lookAtPosition = new THREE.Vector3( 0, 0, - 1 );
const clipPlane = new THREE.Vector4();

const view = new THREE.Vector3();
const target = new THREE.Vector3();
const q = new THREE.Vector4();

const textureMatrix = new THREE.Matrix4();
textureMatrix.autoUpdate = true;

const shader = {
    uniforms: {
        'color': {
            value: null
        },
        'tDiffuse': {
            value: null
        },
        'textureMatrix': {
            value: null
        }
    },

    vertexShader: /* glsl */`
        uniform mat4 textureMatrix;
        varying vec4 vUv;

        #include <common>
        #include <logdepthbuf_pars_vertex>

        void main() {

            vUv = textureMatrix * vec4( position, 1.0 );

            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

            #include <logdepthbuf_vertex>

        }`,

    fragmentShader: /* glsl */`
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        varying vec4 vUv;

        #include <logdepthbuf_pars_fragment>

        float blendOverlay( float base, float blend ) {

            return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );

        }

        vec3 blendOverlay( vec3 base, vec3 blend ) {

            return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );

        }

        void main() {

            #include <logdepthbuf_fragment>

            vec4 base = texture2DProj( tDiffuse, vUv );
            gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );

        }`
}  


// create the additional parts of the object needed for the AFRAME component
let child = {
    schema: {
        // name is hopefully unique for each instance
        name: {
            type: "string",
            default: ""
        },

        // our data
        width: {
            type: "number",
            default: 1
        },
        parameter1: {
            type: "string",
            default: ""
        }
    },

    // fullName is used to generate names for the AFRame objects we create.  Should be
    // unique for each instance of an object, which we specify with name.  If name does
    // name get used as a scheme parameter, it defaults to the name of it's parent glTF
    // object, which only works if those are uniquely named.
    init: function () {
        this.startInit();

        // the template uses these to set things up.  relativeSize
        // is used to set the size of the object relative to the size of the image
        // that it's attached to: a size of 1 means 
        //   "the size of 1x1x1 units in the object
        //    space will be the same as the size of the image".  
        // Larger relative sizes will make the object smaller because we are
        // saying that a size of NxNxN maps to the Size of the image, and vice versa.  
        // For example, if the object below is 2,2 in size and we set size 2, then
        // the object will remain the same size as the image. If we leave it at 1,1,
        // then the object will be twice the size of the image. 
        this.relativeSize = this.data.width;

        // we should set fullName if we have a meaningful name
        if (this.data.name && this.data.name.length > 0) {
            this.fullName = this.data.name;
        }

        this.lastUpdate = performance.now();
        this.updateRenderTargetNextTick = false;

        this.cameraSystem = this.el.sceneEl.systems["camera-tools"];

        // finish the initialization
        this.finishInit();
    },

    remove() {
        this.removeTemplate();
      },
    
    // if anything changed in this.data, we need to update the object.  
    // this is probably not going to happen, but could if another of 
    // our scripts modifies the component properties in the DOM
    update: function () {},

    // do some stuff to get async data.  Called by initTemplate()
    loadData: async function () {
        return
    },

    // called by initTemplate() when the component is being processed.  Here, we create
    // the three.js objects we want, and add them to simpleContainer (an AFrame node 
    // the template created for us).
    initializeData: function () {   
        this.camera = document.getElementById("viewing-camera").object3DMap.camera;

        this.mirror = new THREE.Mesh(new THREE.PlaneBufferGeometry(1, 1));
    
        const parameters = {
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.NearestFilter,
            encoding: THREE.sRGBEncoding,
            // depth: false,
            // stencil: false
        };
        this.renderTarget = new THREE.WebGLRenderTarget( TEXTURE_WIDTH, TEXTURE_HEIGHT, parameters );
        this.renderTarget.texture.generateMipmaps = true;

        this.virtualCamera = new THREE.PerspectiveCamera();
        this.virtualCamera.matrixAutoUpdate = true;

        const material = new THREE.ShaderMaterial( {
            uniforms: THREE.UniformsUtils.clone( shader.uniforms ),
            fragmentShader: shader.fragmentShader,
            vertexShader: shader.vertexShader
        } );

        material.uniforms[ 'tDiffuse' ].value = this.renderTarget.texture;
        material.uniforms[ 'color' ].value = new THREE.Color(BASE_COLOR);
        material.uniforms[ 'textureMatrix' ].value = textureMatrix;
        this.mirror.material = material;

        this.mirror.matrixAutoUpdate = true;
        this.mirrorContainer = new THREE.Group()
        this.mirrorContainer.add(this.mirror)
        this.simpleContainer.setObject3D('mirror',this.mirrorContainer)

        // Make video-texture-target objects inivisible before rendering to the frame buffer
        // Chromium checks for loops when drawing to a framebuffer so if we don't exclude the objects
        // that are using that rendertarget's texture we get an error. Firefox does not check.
        // https://chromium.googlesource.com/chromium/src/+/460cac969e2e9ac38a2611be1a32db0361d88bfb/gpu/command_buffer/service/gles2_cmd_decoder.cc#9516
        this.el.object3D.traverse(o => {
            o.layers.mask1 = o.layers.mask;
            o.layers.set(CAMERA_LAYER_VIDEO_TEXTURE_TARGET);
        });
        
        // tell the portals to update their view
        this.el.sceneEl.emit('updatePortals') 
    },

    // called from remove() in the template to remove any local resources when the component
    // is destroyed
    remove: function () {
        this.simpleContainer.removeObject3D("mirror")
        this.mirror.geometry.dispose()
        this.mirror.material.dispose()
        this.removeTemplate()
    },

    // per frame stuff
    tick: function (time) {
        if (!this.mirror) {
            // haven't finished initializing yet
            return;
        }
        // Always draw held, snapping, or recording camera viewfinders with a decent framerate
        if (performance.now() - this.lastUpdate >= 1000 / MIRROR_FPS
        ) {
            this.updateRenderTargetNextTick = true;
        }    
    },

    tock: function() {
        // a lot of this is taken from hub's src/components/camera-tool.js and
        // three.js Reflector.js
        if (this.updateRenderTargetNextTick) {
            const sceneEl = this.el.sceneEl;
            const renderer = sceneEl.renderer;
            const camera = this.camera;
            const now = performance.now();
            const playerHead = this.cameraSystem && this.cameraSystem.playerHead;

            camera.updateMatrices(true,true);

            if (!this.playerHud) {
                const hudEl = document.getElementById("player-hud");
                this.playerHud = hudEl && hudEl.object3D;
            }

            if (playerHead) {
                // We want to scale our own head in between frames now that we're using the mirror.
                let scale = 1;
                
                // TODO: The local-audio-analyser has the non-networked media stream, which is active
                // even while the user is muted. This should be looking at a different analyser that
                // has the networked media stream instead.
                // const analyser = this.el.sceneEl.systems["local-audio-analyser"];
    
                // if (analyser && playerHead.el.components["scale-audio-feedback"]) {
                //   scale = getAudioFeedbackScale(this.el.object3D, playerHead, 1, 2, analyser.volume);
                // }
    
                playerHead.visible = true;
                playerHead.scale.set(scale, scale, scale);
                playerHead.updateMatrices(true, true);
                playerHead.updateMatrixWorld(true, true);
            }
    
            let playerHudWasVisible = false;
    
            if (this.playerHud) {
                playerHudWasVisible = this.playerHud.visible;
                this.playerHud.visible = false;
                if (this.el.sceneEl.systems["hubs-systems"]) {
                    for (const mesh of Object.values(this.el.sceneEl.systems["hubs-systems"].spriteSystem.meshes)) {
                    mesh.visible = false;
                    }
                }
            }
    
            const bubbleSystem = this.el.sceneEl.systems["personal-space-bubble"];
            const boneVisibilitySystem = this.el.sceneEl.systems["hubs-systems"].boneVisibilitySystem;
    
            if (bubbleSystem) {
                for (let i = 0, l = bubbleSystem.invaders.length; i < l; i++) {
                    bubbleSystem.invaders[i].disable();
                }
                // HACK, bone visibility typically takes a tick to update, but since we want to be able
                // to have enable() and disable() be reflected this frame, we need to do it immediately.
                boneVisibilitySystem.tick();
            }
    
            const matrixWorld = this.mirror.matrixWorld;
            reflectorWorldPosition.setFromMatrixPosition( matrixWorld );
            cameraWorldPosition.setFromMatrixPosition( camera.matrixWorld );

            rotationMatrix.extractRotation( matrixWorld );

            normal.set( 0, 0, 1 );
            normal.applyMatrix4( rotationMatrix );

            view.subVectors( reflectorWorldPosition, cameraWorldPosition );

            // Avoid rendering when reflector is facing away

            if ( view.dot( normal ) < 0 ) {
                view.reflect( normal ).negate();
                view.add( reflectorWorldPosition );

                rotationMatrix.extractRotation( camera.matrixWorld );

                lookAtPosition.set( 0, 0, - 1 );
                lookAtPosition.applyMatrix4( rotationMatrix );
                lookAtPosition.add( cameraWorldPosition );

                target.subVectors( reflectorWorldPosition, lookAtPosition );
                target.reflect( normal ).negate();
                target.add( reflectorWorldPosition );

                const virtualCamera = this.virtualCamera;
                virtualCamera.position.copy( view );
                virtualCamera.up.set( 0, 1, 0 );
                virtualCamera.up.applyMatrix4( rotationMatrix );
                virtualCamera.up.reflect( normal );
                virtualCamera.lookAt( target );

                virtualCamera.far = camera.far; // Used in WebGLBackground

                virtualCamera.updateMatrices();
                virtualCamera.updateMatrixWorld();
                virtualCamera.projectionMatrix.copy( camera.projectionMatrix );

                // Update the texture matrix
                textureMatrix.set(
                    0.5, 0.0, 0.0, 0.5,
                    0.0, 0.5, 0.0, 0.5,
                    0.0, 0.0, 0.5, 0.5,
                    0.0, 0.0, 0.0, 1.0
                );
                textureMatrix.multiply( virtualCamera.projectionMatrix );
                textureMatrix.multiply( virtualCamera.matrixWorldInverse );
                textureMatrix.multiply( matrixWorld );

                // Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
                // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
                reflectorPlane.setFromNormalAndCoplanarPoint( normal, reflectorWorldPosition );
                reflectorPlane.applyMatrix4( virtualCamera.matrixWorldInverse );

                clipPlane.set( reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant );

                const projectionMatrix = virtualCamera.projectionMatrix;

                q.x = ( Math.sign( clipPlane.x ) + projectionMatrix.elements[ 8 ] ) / projectionMatrix.elements[ 0 ];
                q.y = ( Math.sign( clipPlane.y ) + projectionMatrix.elements[ 9 ] ) / projectionMatrix.elements[ 5 ];
                q.z = - 1.0;
                q.w = ( 1.0 + projectionMatrix.elements[ 10 ] ) / projectionMatrix.elements[ 14 ];

                // Calculate the scaled plane vector
                clipPlane.multiplyScalar( 2.0 / clipPlane.dot( q ) );

                // Replacing the third row of the projection matrix
                projectionMatrix.elements[ 2 ] = clipPlane.x;
                projectionMatrix.elements[ 6 ] = clipPlane.y;
                projectionMatrix.elements[ 10 ] = clipPlane.z + 1.0 - clipBias;
                projectionMatrix.elements[ 14 ] = clipPlane.w;

                // Render
                this.renderTarget.texture.encoding = renderer.outputEncoding;

                this.mirror.visible = false;

                const currentRenderTarget = renderer.getRenderTarget();

                const currentXrEnabled = renderer.xr.enabled;
                const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

                renderer.xr.enabled = false; // Avoid camera modification
                renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows
                const tmpOnAfterRender = sceneEl.object3D.onAfterRender;
                delete sceneEl.object3D.onAfterRender;

                renderer.setRenderTarget( this.renderTarget );

                //renderer.state.buffers.depth.setMask( true ); // make sure the depth buffer is writable so it can be properly cleared, see #18897

                if ( renderer.autoClear === false ) renderer.clear();

                renderer.render( sceneEl.object3D, virtualCamera );

                renderer.xr.enabled = currentXrEnabled;
                renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
                sceneEl.object3D.onAfterRender = tmpOnAfterRender;

                renderer.setRenderTarget( currentRenderTarget );

                // // Restore viewport
                // const viewport = camera.viewport;
                // if ( viewport !== undefined ) {
                //     renderer.state.viewport( viewport );
                // }

                this.mirror.visible = true;
            }

            if (playerHead) {
                playerHead.visible = false;
                playerHead.scale.set(0.00000001, 0.00000001, 0.00000001);
                playerHead.updateMatrices(true, true);
                playerHead.updateMatrixWorld(true, true);
            }
    
            if (this.playerHud) {
                this.playerHud.visible = playerHudWasVisible;
                if (this.el.sceneEl.systems["hubs-systems"]) {
                    for (const mesh of Object.values(this.el.sceneEl.systems["hubs-systems"].spriteSystem.meshes)) {
                    mesh.visible = true;
                    }
                }
            }
    
            if (bubbleSystem) {
                for (let i = 0, l = bubbleSystem.invaders.length; i < l; i++) {
                    bubbleSystem.invaders[i].enable();
                }
                // HACK, bone visibility typically takes a tick to update, but since we want to be able
                // to have enable() and disable() be reflected this frame, we need to do it immediately.
                boneVisibilitySystem.tick();
            }
            
            this.lastUpdate = now;
            this.updateRenderTargetNextTick = false;
        }    
    }     
}

// register the component with the AFrame scene
AFRAME.registerComponent(componentName, {
    ...child,
    ...template
})