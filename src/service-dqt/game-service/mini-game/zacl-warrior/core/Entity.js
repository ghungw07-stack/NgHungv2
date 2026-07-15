/**
 * Entity.js
 * Lớp cơ sở cho tất cả các đối tượng trong game
 */

export class Entity {
  constructor(id, name, description = '') {
    this.id = id;
    this.name = name;
    this.description = description;
  }

  getId() {
    return this.id;
  }

  getName() {
    return this.name;
  }

  getDescription() {
    return this.description;
  }

  setName(name) {
    this.name = name;
  }

  setDescription(description) {
    this.description = description;
  }
} 