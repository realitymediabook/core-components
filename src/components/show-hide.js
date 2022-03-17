const worldCameraPos = new THREE.Vector3()  

AFRAME.registerComponent('show-hide', {
    schema: {
        radius: { type: 'number', default: 1 },
        showClose: { type: 'boolean', default: true },
    },

    init: function () {
        this.innerRadius = this.data.radius * 0.95;
        this.outerRadius = this.data.radius * 1.05;
    },

    tick: function (time) {
        this.el.sceneEl.camera.getWorldPosition(worldCameraPos);
        this.el.object3D.worldToLocal(worldCameraPos);

        let l = worldCameraPos.length();
        if (l < this.innerRadius) {
            this.el.object3D.visible = this.data.showClose;
        } else if (l > this.outerRadius) {
            this.el.object3D.visible = !this.data.showClose;
        }
    }
})