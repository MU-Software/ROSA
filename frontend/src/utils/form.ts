import { MutateFunction, MutateOptions } from '@tanstack/react-query'
import * as R from 'remeda'

export type PossibleFormInputType = HTMLFormElement | undefined | null
export type FormResultObject = { [k: string]: FormDataEntryValue | boolean | null }

export const isFormValid = (form: HTMLFormElement | null | undefined): form is HTMLFormElement => {
  if (!(R.isObjectType(form) && form instanceof HTMLFormElement)) return false

  if (!form.checkValidity()) {
    form.reportValidity()
    return false
  }

  return true
}

export function getFormValue<T>(_: { form: HTMLFormElement; fieldToExcludeWhenFalse?: string[]; fieldToNullWhenFalse?: string[] }): T {
  const formData: {
    [k: string]: FormDataEntryValue | boolean | null
  } = Object.fromEntries(new FormData(_.form))
  Object.keys(formData)
    .filter((key) => (_.fieldToExcludeWhenFalse ?? []).includes(key) || (_.fieldToNullWhenFalse ?? []).includes(key))
    .filter((key) => R.isEmpty(formData[key] as string))
    .forEach((key) => {
      if ((_.fieldToExcludeWhenFalse ?? []).includes(key)) {
        delete formData[key]
      } else if ((_.fieldToNullWhenFalse ?? []).includes(key)) {
        formData[key] = null
      }
    })
  Array.from(_.form.children).forEach((child) => {
    const targetElement: Element | null = child
    if (targetElement && !(targetElement instanceof HTMLInputElement)) {
      const targetElements = targetElement.querySelectorAll('input')
      for (const target of targetElements)
        if (target instanceof HTMLInputElement && target.type === 'checkbox') formData[target.name] = target.checked ? true : false
    }
  })
  return formData as T
}

export const mutateForm = (
  form: PossibleFormInputType,
  mutation: MutateFunction<unknown, unknown, unknown, unknown>,
  options: MutateOptions<unknown, unknown, unknown, unknown> = {}
) => {
  if (isFormValid(form)) mutation(getFormValue<FormResultObject>({ form }), options)
}
