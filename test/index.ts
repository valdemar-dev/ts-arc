// test-decorators.ts

import "reflect-metadata";

function Log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    descriptor.value = function (...args: any[]) {
        console.log(`Calling ${propertyKey} with`, args);
        return original.apply(this, args);
    };
}

class User {
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    @Log
    greet(message: string): string {
        return `${this.name} says: ${message}`;
    }
}

@Entity()
class Person {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    firstName: string;

    @Column()
    lastName: string;

    constructor(firstName: string, lastName: string) {
        this.firstName = firstName;
        this.lastName = lastName;
    }
}

// Simple mock for TypeORM decorators (just to test metadata emission)
function Entity() {
    return function (constructor: Function) {
        // no-op
    };
}

function PrimaryGeneratedColumn() {
    return function (target: Object, propertyKey: string) {
        // no-op
    };
}

function Column() {
    return function (target: Object, propertyKey: string) {
        // no-op
    };
}

// Test basic decorator
const user = new User("Alice");
console.log(user.greet("Hello")); // Should log: Calling greet with [ 'Hello' ] and output "Alice says: Hello"

// Test reflect-metadata + emitDecoratorMetadata
console.log("\n--- Metadata checks ---");

console.log("User.greet param types:", Reflect.getMetadata("design:paramtypes", User.prototype, "greet"));
console.log("Person constructor param types:", Reflect.getMetadata("design:paramtypes", Person));
console.log("Person.id type:", Reflect.getMetadata("design:type", Person.prototype, "id"));
console.log("Person.firstName type:", Reflect.getMetadata("design:type", Person.prototype, "firstName"));

const person = new Person("John", "Doe");
console.log(person);