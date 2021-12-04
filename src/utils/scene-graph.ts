// copied from hubs
import { Entity, Component } from 'aframe'

export function findAncestorWithComponent(entity: Entity, componentName: string): Entity | null {
    while (entity && !(entity.components && entity.components[componentName])) {
      entity = (entity.parentNode as Entity);
    }
    return entity;
  }
  
  export function findComponentsInNearestAncestor(entity: Entity, componentName: string): Component[] {
    const components = [];
    while (entity) {
      if (entity.components) {
        for (const c in entity.components) {
          if (entity.components[c].name === componentName) {
            components.push(entity.components[c]);
          }
        }
      }
      if (components.length) {
        return components;
      }
      entity = entity.parentNode as Entity;
    }
    return components;
  }
  