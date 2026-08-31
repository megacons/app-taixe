/**
 * DateInput — input[type="date"] chuẩn format dd/MM/yyyy (vi-VN)
 * Compatible với react-hook-form {...register(...)} spread
 */
import React from 'react';

type DateInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
};

export default function DateInput({ className = '', ...rest }: DateInputProps) {
  return (
    <input
      type="date"
      lang="vi"
      className={`form-input ${className}`}
      style={{ colorScheme: 'light' }}
      {...rest}
    />
  );
}
