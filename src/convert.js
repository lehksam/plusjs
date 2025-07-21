import { $, $list, $fn, $t, addToDOM, stateMode } from './plus.js'


export function $component(value, placeholderValue) {
    let state = $(value, placeholderValue, true)
    state.setType('component')
    return state
}


const data = $(Array.from({ length: 10000 }, (_, i) => ({
    product: 'Apple',
    price: Math.random().toPrecision(1) * 1000
  })))

const editRow = $(1)

const handler = $fn((i) => {
    data.pop()
})

export const app = $component(() => { 
    
    return /*html*/`
        <div class='table-container'>
        <table>
        <thead>
                <tr>
                <th>Product Name</th>
                <th>Price</th>
                </tr>
        </thead>
        <tbody id='tbody'>
        ${$list(data, (i) => /*html*/`
            <tr>
            <td onclick=${handler.args(i)}>${$(() =>  {
                let s = $(() => { 
                    return data[i].product === 'Apple' ? $(() => data[i].price ? $(() => data[i].price + 10) : 0) : $t(`<span>Apple ${data[i].price}</span>`)
                })
                let t = $t(/*html*/`<input />`)
                return editRow.value !== null ? s : t
            }
            )}</td> 
                <td>${data[i].price}</td>
            </tr>
        `)}
        
        </tbody>
        </table>
        </div>
    ` 
})

addToDOM(app, document.getElementById('app'))
