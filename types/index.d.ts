export declare global {
    interface GLTFModelPlusType {
        registerComponent:(a: string, b: string) => void
    }

    namespace AFRAME {
        // add you custom properties and methods
        const GLTFModelPlus: GLTFModelPlusType
    }
}
