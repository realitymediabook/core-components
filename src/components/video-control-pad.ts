/**
 * control a video from a component you stand on.  Implements a radius from the center of 
 * the object it's attached to, in meters
 */

import { Entity, Component } from 'aframe'
import { findAncestorWithComponent } from '../utils/scene-graph'
import './proximity-events.js'

interface AObject3D extends THREE.Object3D {
    el: Entity
}

AFRAME.registerComponent('video-control-pad', {
    mediaVideo: {} as Component,
    
    schema: {
        target: { type: 'string', default: "" },  // if nothing passed, just create some noise
        radius: { type: 'number', default: 1 }
    },

    init: function () {
        if (this.data.target.length == 0) {
            console.warn("video-control-pad must have 'target' set")
            return
        }

        // wait until the scene loads to finish.  We want to make sure everything
        // is initialized
        let root = findAncestorWithComponent(this.el, "gltf-model-plus")
        root && root.addEventListener("model-loaded", () => { 
            this.initialize()
        });
    },
    
    initialize: function () {
        let v = this.el.sceneEl?.object3D.getObjectByName(this.data.target) as AObject3D
        if (v == undefined) {
            console.warn("video-control-pad target '" + this.data.target + "' does not exist")
            return
        }

        if ( v.el.components["media-loader"] || v.el.components["media-video"] ) {
            if (v.el.components["media-loader"]) {
                let fn = () => {
                    this.setupVideoPad(v)
                    v.el.removeEventListener('model-loaded', fn)
                 }
                v.el.addEventListener("media-loaded", fn)
            } else {
                this.setupVideoPad(v)
            }
        } else {
            console.warn("video-control-pad target '" + this.data.target + "' is not a video element")
        }

    },

    setupVideoPad: function (video: AObject3D) {
        this.mediaVideo = video.el.components["media-video"]
        if (this.mediaVideo == undefined) {
            console.warn("video-control-pad target '" + this.data.target + "' is not a video element")
        }

        // //@ts-ignore
        // if (!this.mediaVideo.video.paused) {
        //     //@ts-ignore
        //     this.mediaVideo.togglePlaying()
        // }

        this.el.setAttribute('proximity-events', { radius: this.data.radius, Yoffset: 1.6 })
        this.el.addEventListener('proximityenter', () => this.enterRegion())
        this.el.addEventListener('proximityleave', () => this.leaveRegion())
    },

    enterRegion: function () {
        if (this.mediaVideo.data.videoPaused) {
            //@ts-ignore
            this.mediaVideo.togglePlaying()
        }
    },

    leaveRegion: function () {
        if (!this.mediaVideo.data.videoPaused) {
            //@ts-ignore
            this.mediaVideo.togglePlaying()
        }
    },
})
