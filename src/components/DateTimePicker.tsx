"use client";

import { useState, useEffect, useRef } from "react";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [hour, setHour] = useState("12");
  const [minute, setMinute] = useState("00");
  const [ampm, setAmpm] = useState<"AM" | "PM">("PM");
  const calendarRef = useRef<HTMLDivElement>(null);

  // Parse initial value
  useEffect(() => {
    if (value) {
      const dateObj = new Date(value);
      if (!isNaN(dateObj.getTime())) {
        setSelectedDate(dateObj);
        setViewDate(dateObj);

        let hours = dateObj.getHours();
        const mins = dateObj.getMinutes();
        const isPM = hours >= 12;

        if (hours === 0) hours = 12;
        else if (hours > 12) hours -= 12;

        setHour(hours.toString());
        setMinute(mins.toString().padStart(2, "0"));
        setAmpm(isPM ? "PM" : "AM");
      }
    }
  }, []);

  // Close calendar when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Emit change when date or time changes
  const emitChange = (date: Date | null, h: string, m: string, ap: "AM" | "PM") => {
    if (!date) return;

    let hours24 = parseInt(h);
    if (ap === "PM" && hours24 !== 12) hours24 += 12;
    if (ap === "AM" && hours24 === 12) hours24 = 0;

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hourStr = hours24.toString().padStart(2, "0");

    onChange(`${year}-${month}-${day}T${hourStr}:${m}`);
  };

  const handleDateSelect = (day: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    setSelectedDate(newDate);
    setShowCalendar(false);
    emitChange(newDate, hour, minute, ampm);
  };

  const handleTimeChange = (h: string, m: string, ap: "AM" | "PM") => {
    setHour(h);
    setMinute(m);
    setAmpm(ap);
    emitChange(selectedDate, h, m, ap);
  };

  // Calendar navigation
  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // Generate calendar days
  const generateCalendarDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: (number | null)[] = [];

    // Empty slots for days before first day of month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return { days, today, year, month };
  };

  const { days, today, year, month } = generateCalendarDays();

  // Quick date buttons
  const setToday = () => {
    const now = new Date();
    setSelectedDate(now);
    setViewDate(now);
    emitChange(now, hour, minute, ampm);
  };

  const setTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedDate(tomorrow);
    setViewDate(tomorrow);
    emitChange(tomorrow, hour, minute, ampm);
  };

  const setNextWeek = () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    setSelectedDate(nextWeek);
    setViewDate(nextWeek);
    emitChange(nextWeek, hour, minute, ampm);
  };

  // Format display date
  const formatDisplayDate = () => {
    if (!selectedDate) return "Select date";
    return selectedDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  return (
    <div className="space-y-3">
      {/* Quick date buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={setToday}
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition"
        >
          Today
        </button>
        <button
          type="button"
          onClick={setTomorrow}
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition"
        >
          Tomorrow
        </button>
        <button
          type="button"
          onClick={setNextWeek}
          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition"
        >
          Next Week
        </button>
      </div>

      <div className="flex gap-3">
        {/* Date Picker */}
        <div className="flex-1 relative" ref={calendarRef}>
          <label className="block text-xs text-gray-500 mb-1">Date</label>
          <button
            type="button"
            onClick={() => setShowCalendar(!showCalendar)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-left text-white
                       hover:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none
                       flex items-center justify-between"
          >
            <span className={selectedDate ? "text-white" : "text-gray-500"}>
              {formatDisplayDate()}
            </span>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Calendar Dropdown */}
          {showCalendar && (
            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 p-3 w-72">
              {/* Month/Year Header */}
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="p-1 hover:bg-gray-700 rounded"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="font-medium">
                  {MONTHS[month]} {year}
                </span>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="p-1 hover:bg-gray-700 rounded"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS.map(day => (
                  <div key={day} className="text-center text-xs text-gray-500 py-1">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} />;
                  }

                  const dateForDay = new Date(year, month, day);
                  const isToday = dateForDay.getTime() === today.getTime();
                  const isSelected = selectedDate &&
                    selectedDate.getDate() === day &&
                    selectedDate.getMonth() === month &&
                    selectedDate.getFullYear() === year;
                  const isPast = dateForDay < today;

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => !isPast && handleDateSelect(day)}
                      disabled={isPast}
                      className={`
                        p-2 text-sm rounded text-center transition
                        ${isPast ? "text-gray-600 cursor-not-allowed" : "hover:bg-gray-700 cursor-pointer"}
                        ${isToday && !isSelected ? "border border-blue-500" : ""}
                        ${isSelected ? "bg-blue-600 text-white" : ""}
                      `}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Time Picker */}
        <div className="flex gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hour</label>
            <select
              value={hour}
              onChange={(e) => handleTimeChange(e.target.value, minute, ampm)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white
                         focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Min</label>
            <select
              value={minute}
              onChange={(e) => handleTimeChange(hour, e.target.value, ampm)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white
                         focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">&nbsp;</label>
            <select
              value={ampm}
              onChange={(e) => handleTimeChange(hour, minute, e.target.value as "AM" | "PM")}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white
                         focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>
      </div>

      {/* Selected datetime preview */}
      {selectedDate && (
        <div className="text-sm text-gray-400">
          Scheduled for: {selectedDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
          })} at {hour}:{minute} {ampm}
        </div>
      )}
    </div>
  );
}
